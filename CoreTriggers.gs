/**
 * @file CoreTriggers.gs
 * @description Functions for listing and deleting trigger configurations and their associated triggers.
 */

(function(namespace) {

  namespace._internal = namespace._internal || {};

  /**
   * Lists details of all configured recurring checks stored by this library.
   * @returns {Array<Object>} An array of configuration objects stored in ScriptProperties.
   * Returns an empty array if none are found or on error.
   */
  namespace.listAllConfigs = function() {
	  try {
		  return namespace._internal._getAllConfigs();
	  } catch (e) {
		  Logger.log("Error retrieving all configurations: %s", e);
		  return []; // Return empty array on error
	  }
  };

  /**
   * Lists details of configured recurring checks matching a specific unique ID.
   * @param {string} uniqueId The unique identifier used when setting up the check.
   * @returns {Object|null} The configuration object, or null if not found or on error.
   */
  namespace.getConfigByUniqueId = function(uniqueId) {
	if (!uniqueId) {
		Logger.log("getConfigByUniqueId requires a uniqueId parameter.");
		return null;
	}
	var configPropKey = namespace._internal._getConfigPropKey(uniqueId);
	var scriptProperties = PropertiesService.getScriptProperties();
	var configJson = scriptProperties.getProperty(configPropKey);
	if (configJson) {
		try {
			var configData = JSON.parse(configJson);
			// Basic validation
			if (configData && typeof configData === 'object' && configData.uniqueId === uniqueId) {
				return configData;
			} else {
				 Logger.log('Warning: Stored data for key %s is invalid or does not match uniqueId "%s".', configPropKey, uniqueId);
				 // Clean up potentially corrupted data? Risky. Let delete handle it.
				 return null;
			}
		} catch (e) {
			Logger.log('Error parsing stored config for uniqueId "%s" (key %s): %s', uniqueId, configPropKey, e);
			return null;
		}
	}
	return null; // Not found
  };

  /**
   * Lists details of configured recurring checks matching an event name substring.
   * Note: This might return multiple configs if the same substring is used in different setups.
   * @param {string} eventNameSubstring The substring used in the setup.
   * @returns {Array<Object>} An array of matching configuration objects. Returns empty array if none match or on error.
   */
  namespace.getConfigsByEventSubstring = function(eventNameSubstring) {
	if (!eventNameSubstring) {
		Logger.log("getConfigsByEventSubstring requires an eventNameSubstring parameter.");
		return [];
	}
	try {
		var allConfigs = namespace._internal._getAllConfigs();
		return allConfigs.filter(function(config) {
			// Ensure config is valid before checking property
			return config && config.eventNameSubstring && config.eventNameSubstring === eventNameSubstring;
		});
	} catch (e) {
		Logger.log("Error filtering configurations by event substring '%s': %s", eventNameSubstring, e);
		return [];
	}
  };

   /**
   * Lists all active Google Apps Script triggers created BY THIS SCRIPT for the recurring check function (`_CET_checkEventsAndTrigger`).
   * Note: There might only be one trigger shared by multiple configurations.
   *
   * @returns {Array<ScriptApp.Trigger>} An array of Trigger objects created by this library's setup function. Returns empty array on error.
   */
  namespace.listRecurringTriggers = function() {
	try {
		var projectTriggers = ScriptApp.getProjectTriggers();
		var libraryTriggers = [];
		projectTriggers.forEach(function(trigger) {
		  // Check if the trigger calls our specific handler function
		  if (trigger.getHandlerFunction() === '_CET_checkEventsAndTrigger') {
			libraryTriggers.push(trigger);
		  }
		});
		return libraryTriggers;
	} catch (e) {
		Logger.log("Error listing project triggers: %s", e);
		return [];
	}
  };


  /**
   * Deletes the configuration AND the associated recurring trigger(s) for a specific unique ID.
   * If the trigger is shared by other configurations, it will only be deleted if this is the LAST configuration using it.
   *
   * @param {string} uniqueId The unique identifier used when setting up the check.
   * @returns {boolean} True if the configuration property was successfully deleted (regardless of trigger state), false if the config property could not be found or deleted.
   */
  namespace.deleteConfigAndTrigger = function(uniqueId) {
	if (!uniqueId) {
		Logger.log("deleteConfigAndTrigger requires a uniqueId parameter.");
		return false;
	}
	Logger.log('Attempting to delete configuration and potentially trigger for uniqueId: %s', uniqueId);
	var configPropKey = namespace._internal._getConfigPropKey(uniqueId);
	var triggerIdPropKey = namespace._internal._getTriggerIdPropKey(uniqueId);
	var scriptProperties = PropertiesService.getScriptProperties();

	// Get config data *before* deleting the property to find the associated trigger ID
	var configData = namespace.getConfigByUniqueId(uniqueId); // Use the existing getter which includes parsing/validation
	var associatedTriggerId = (configData && configData.associatedTriggerId) ? configData.associatedTriggerId : scriptProperties.getProperty(triggerIdPropKey); // Fallback if needed

	// Check if configuration actually exists before proceeding
	 if (!scriptProperties.getProperty(configPropKey)) {
		 Logger.log('Configuration property for uniqueId "%s" (key %s) not found. Nothing to delete.', uniqueId, configPropKey);
		 // Clean up potentially orphaned trigger ID property if it exists
		 if (scriptProperties.getProperty(triggerIdPropKey)){
			 scriptProperties.deleteProperty(triggerIdPropKey);
			 Logger.log('Cleaned up orphaned trigger ID property: %s', triggerIdPropKey);
		 }
		 return true; // Indicate config wasn't found, but operation "succeeded" in that state. Semantics can be debated here. Let's say true means "config is gone".
	 }


	// --- Delete Configuration Properties ---
	try {
		scriptProperties.deleteProperty(configPropKey);
		// Also delete the potentially redundant trigger ID mapping property
		scriptProperties.deleteProperty(triggerIdPropKey);
		Logger.log('Deleted configuration properties for uniqueId "%s".', uniqueId);
	} catch (e) {
		Logger.log('Error deleting configuration properties for uniqueId "%s": %s. Cannot proceed with trigger check.', uniqueId, e);
		return false; // Critical step failed
	}


	// --- Manage Associated Trigger ---
	if (associatedTriggerId) {
		// Check if any *other* configurations still use this trigger ID AFTER deleting the current one
		var remainingConfigs = namespace._internal._getAllConfigs(); // Get fresh list
		var triggerStillInUse = remainingConfigs.some(function(config) {
			// Ensure config and associatedTriggerId exist before comparing
			return config && config.associatedTriggerId && config.associatedTriggerId === associatedTriggerId;
		});

		if (!triggerStillInUse) {
			Logger.log('Trigger ID %s is no longer used by any remaining configuration. Attempting to delete trigger.', associatedTriggerId);
			try {
				var triggers = ScriptApp.getProjectTriggers();
				var triggerDeleted = false;
				for (var i = 0; i < triggers.length; i++) {
					if (triggers[i].getUniqueId() === associatedTriggerId) {
						// Crucial safety check: Only delete if it runs OUR handler function
						if (triggers[i].getHandlerFunction() === '_CET_checkEventsAndTrigger') {
							ScriptApp.deleteTrigger(triggers[i]);
							Logger.log('Successfully deleted trigger with ID: %s', associatedTriggerId);
							triggerDeleted = true;
							break; // Found and deleted
						} else {
							// This case should be rare if setup logic is correct, but important safeguard
							Logger.log('Warning: Trigger ID %s found but handler function "%s" does not match expected "%s". Trigger was NOT deleted to prevent breaking other scripts.',
									   associatedTriggerId, triggers[i].getHandlerFunction(), '_CET_checkEventsAndTrigger');
						   // Do NOT delete triggers that don't match the handler!
						   triggerDeleted = true; // Treat as "handled" to prevent "Could not find trigger" log later
						   break;
						}
					}
				}
				if (!triggerDeleted) {
					 // This might happen if the trigger was manually deleted earlier
					 Logger.log('Could not find trigger with ID %s to delete (or it was already deleted).', associatedTriggerId);
				}
			} catch (e) {
				// Log error but don't necessarily return false, as config deletion succeeded.
				Logger.log('Error occurred while trying to delete trigger with ID %s: %s. Configuration was deleted.', associatedTriggerId, e);
				// Consider if this should be false? If trigger cleanup fails, is it a success?
				// Let's stick with true meaning "config is gone".
			}
		} else {
			 Logger.log('Trigger ID %s is still in use by other configurations. Trigger was not deleted.', associatedTriggerId);
		}
	} else {
		Logger.log('No associated trigger ID found stored for uniqueId "%s". Only configuration properties were deleted.', uniqueId);
	}
	return true; // Configuration properties were deleted
  };


  /**
   * Deletes ALL configurations AND associated recurring triggers created by this library.
   * Logs extensively and requires careful review before use.
   */
  namespace.deleteAllConfigsAndTriggers = function() {
	Logger.log('--- Starting Deletion of ALL CalendarEventTriggers Configurations and Triggers ---');
	Logger.log('WARNING: This is a destructive operation. Review the logs carefully.');

	var allConfigs = namespace.listAllConfigs(); // Use the public lister
	 if (allConfigs.length === 0) {
		 Logger.log("No configurations found to delete.");
		 Logger.log('--- Deletion Process Finished ---');
		 return;
	 }

	Logger.log("Found %s configurations to be deleted:", allConfigs.length);
	var uniqueIdsToDelete = [];
	var triggerIds PotentiallyToDelete = {}; // Store unique trigger IDs associated with configs

	allConfigs.forEach(function(config){
		// Validate config structure before logging/processing
		if (config && config.uniqueId && config.eventNameSubstring && config.functionToRun) {
			Logger.log("- uniqueId: %s, eventNameSubstring: %s, functionToRun: %s, triggerId: %s",
					   config.uniqueId, config.eventNameSubstring, config.functionToRun, config.associatedTriggerId || 'N/A');
			uniqueIdsToDelete.push(config.uniqueId);
			if (config.associatedTriggerId) {
				triggerIdsPotentiallyToDelete[config.associatedTriggerId] = true; // Collect unique trigger IDs
			}
		} else {
			 Logger.log("- Found invalid config object: %s", JSON.stringify(config));
		}
	});

	Logger.log('--- Proceeding with Deletion ---');
	// Add a short pause for safety? Only works in editor runs, not triggers.
	// Utilities.sleep(3000); // Pause for 3 seconds (optional)

	var errors = false;
	var deletedCount = 0;

	uniqueIdsToDelete.forEach(function(uniqueId) {
	   Logger.log('Deleting config for uniqueId: %s...', uniqueId);
	   // Use a simplified deletion focusing only on properties here, trigger cleanup happens after
	   var configPropKey = namespace._internal._getConfigPropKey(uniqueId);
	   var triggerIdPropKey = namespace._internal._getTriggerIdPropKey(uniqueId);
	   try {
		   PropertiesService.getScriptProperties().deleteProperty(configPropKey);
		   PropertiesService.getScriptProperties().deleteProperty(triggerIdPropKey); // Delete mapping too
		   Logger.log('Successfully deleted properties for uniqueId: %s.', uniqueId);
		   deletedCount++;
	   } catch (e) {
		   errors = true;
		   Logger.log('ERROR deleting properties for uniqueId %s: %s', uniqueId, e);
	   }
	});

	Logger.log('Deleted %s configuration property sets.', deletedCount);

	// --- Trigger Cleanup ---
	// Now attempt to delete all triggers associated with the configs we just removed properties for
	var triggerIds = Object.keys(triggerIdsPotentiallyToDelete);
	if (triggerIds.length > 0) {
		Logger.log('Attempting to delete %s unique associated trigger(s)...', triggerIds.length);
		try {
			var projectTriggers = ScriptApp.getProjectTriggers();
			triggerIds.forEach(function(triggerId) {
				Logger.log('Checking trigger ID: %s', triggerId);
				var triggerDeleted = false;
				for (var i = 0; i < projectTriggers.length; i++) {
					if (projectTriggers[i].getUniqueId() === triggerId) {
						 // SAFETY CHECK: Only delete if it's OUR handler
						 if (projectTriggers[i].getHandlerFunction() === '_CET_checkEventsAndTrigger') {
							 try {
								 ScriptApp.deleteTrigger(projectTriggers[i]);
								 Logger.log('Successfully deleted trigger ID: %s', triggerId);
								 triggerDeleted = true;
							 } catch (e) {
								 errors = true;
								 Logger.log('ERROR deleting trigger ID %s: %s', triggerId, e);
							 }
							 break; // Move to next trigger ID once found/handled
						 } else {
							  Logger.log('Warning: Trigger ID %s found but handler function "%s" does not match expected "%s". Trigger was NOT deleted.',
									   triggerId, projectTriggers[i].getHandlerFunction(), '_CET_checkEventsAndTrigger');
							  triggerDeleted = true; // Mark as handled (by not deleting)
							  break;
						 }
					}
				}
				if (!triggerDeleted) {
					Logger.log('Trigger ID %s was not found among project triggers (may have been deleted already).', triggerId);
				}
			});
		} catch (e) {
			errors = true;
			Logger.log('ERROR accessing project triggers during cleanup: %s', e);
		}
	} else {
		Logger.log('No associated trigger IDs found in configurations to delete.');
	}

	// Final check for orphaned library triggers (optional but good practice)
	try {
		var remainingLibTriggers = namespace.listRecurringTriggers();
		if (remainingLibTriggers.length > 0) {
			Logger.log('WARNING: Found %s recurring trigger(s) potentially orphaned after deletion process. This might indicate an issue or manual trigger creation. Attempting cleanup.', remainingLibTriggers.length);
			remainingLibTriggers.forEach(function(trigger) {
				try {
					Logger.log('Deleting potentially orphaned trigger ID: %s (Handler: %s)', trigger.getUniqueId(), trigger.getHandlerFunction());
					ScriptApp.deleteTrigger(trigger);
				} catch (e) {
					errors = true;
					Logger.log('Error deleting potentially orphaned trigger ID %s: %s', trigger.getUniqueId(), e);
				}
			});
		}
	} catch (e) {
		 errors = true;
		 Logger.log('Error during final orphan trigger check: %s', e);
	}


	if (errors) {
		Logger.log('--- Deletion Process Finished with Errors ---');
	} else {
		Logger.log('--- Successfully Deleted All Configurations and Associated Triggers ---');
	}
  };


})(CalendarEventTriggers); // Pass the namespace object