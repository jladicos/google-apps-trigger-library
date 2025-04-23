/**
 * @file RecurringCheck.gs
 * @description Sets up and manages the recurring check for calendar events.
 */

(function(namespace) {

  // Expose internal functions via the namespace's _internal object
  namespace._internal = namespace._internal || {};

  var CHECK_FUNCTION_NAME = '_CET_checkEventsAndTrigger'; // Name of the function the trigger will call

  /**
   * Sets up a recurring trigger to check for upcoming events.
   * This creates ONE time-driven trigger that periodically runs _CET_checkEventsAndTrigger.
   * That function then checks all configured event criteria.
   *
   * @param {string} eventNameSubstring The text to search for within event names.
   * @param {number} daysBefore Positive integer representing how many days before the event start date the trigger should fire.
   * @param {string} functionToRun The exact name of the GLOBAL function in your script project to execute when the criteria are met. This function will receive the Google Calendar Event object as an argument.
   * @param {number} [checkFrequencyHours=6] Optional. How often (in hours) the check should run (e.g., 1 for hourly, 6 for every 6 hours, 24 for daily). Min 1. Defaults to 6.
   * @param {string} [uniqueId=eventNameSubstring + functionToRun] Optional. A unique identifier for this specific setup. Defaults to combining eventNameSubstring and functionToRun. Use this if you need multiple setups with the same substring/function but different daysBefore, for example.
   */
  namespace.setupRecurringCheck = function(eventNameSubstring, daysBefore, functionToRun, checkFrequencyHours, uniqueId) {
	// Validation
	if (!eventNameSubstring || typeof eventNameSubstring !== 'string') throw new Error('eventNameSubstring must be a non-empty string.');
	if (typeof daysBefore !== 'number' || !Number.isInteger(daysBefore) || daysBefore <= 0) throw new Error('daysBefore must be a positive integer.');
	if (!functionToRun || typeof functionToRun !== 'string') throw new Error('functionToRun must be a non-empty string (the name of the function).');

	// Use internal helper to check function existence
	if (!namespace._internal._functionExists(functionToRun)) {
		throw new Error('The specified functionToRun "' + functionToRun + '" does not appear to exist in the global scope or is not a function. Please ensure it is defined correctly before setting up the trigger.');
	}


	checkFrequencyHours = (typeof checkFrequencyHours === 'number' && checkFrequencyHours >= 1) ? Math.ceil(checkFrequencyHours) : 6; // Default to 6 hours if invalid or missing
	uniqueId = uniqueId || (eventNameSubstring + '_' + functionToRun); // Default unique ID

	var calendarId = namespace.getConfiguredCalendarId();
	if (!calendarId) throw new Error('Calendar ID not configured. Please run CalendarEventTriggers.setCalendarId(id) first.');

	var configPropKey = namespace._internal._getConfigPropKey(uniqueId);
	var triggerIdPropKey = namespace._internal._getTriggerIdPropKey(uniqueId);
	var scriptProperties = PropertiesService.getScriptProperties();

	// Check if a setup with this uniqueId already exists
	if (scriptProperties.getProperty(configPropKey)) {
		Logger.log('A recurring check configuration with uniqueId "%s" already exists. To modify, delete the existing one first using deleteConfigAndTrigger.', uniqueId);
		// Optionally, update the existing config instead of throwing an error
		// Or just return silently:
		 return;
	}


	// --- Create the Trigger ---
	// Check if a trigger for our CHECK_FUNCTION_NAME already exists *for this script*
	var existingTrigger = null;
	var allTriggers = ScriptApp.getProjectTriggers();
	for (var i = 0; i < allTriggers.length; i++) {
		if (allTriggers[i].getHandlerFunction() === CHECK_FUNCTION_NAME) {
			existingTrigger = allTriggers[i];
			Logger.log('An existing recurring trigger for %s was found (ID: %s). Re-using it.', CHECK_FUNCTION_NAME, existingTrigger.getUniqueId());
			break;
		}
	}

	var triggerId;
	if (!existingTrigger) {
		try {
			Logger.log('Creating new recurring trigger to run %s every %s hours.', CHECK_FUNCTION_NAME, checkFrequencyHours);
			// It's generally better to trigger slightly off the hour to avoid thundering herd issues
			var triggerMinute = Math.floor(Math.random() * 60); // Random minute
			Logger.log('Scheduling trigger near minute %s of the hour.', triggerMinute);
			var newTrigger = ScriptApp.newTrigger(CHECK_FUNCTION_NAME)
				.timeBased()
				.everyHours(checkFrequencyHours)
				// .nearMinute(triggerMinute) // Add some jitter - Note: nearMinute() might not be available in all execution contexts or versions. Check documentation if issues arise.
				// If nearMinute causes issues, remove it. The core everyHours() is the essential part.
				.create();
			triggerId = newTrigger.getUniqueId();
			Logger.log('Successfully created new trigger with ID: %s', triggerId);
		} catch (e) {
			Logger.log('Error creating trigger: %s', e);
			// Provide more specific advice if possible (e.g., check authorization)
			 if (e.message.indexOf("Authorization is required") !== -1) {
				 Logger.log("Please ensure the script has the necessary authorization to manage triggers and run automatically. You may need to run a function manually from the editor first.");
			 }
			throw new Error('Failed to create the recurring trigger. Check script permissions and quotas. Error: ' + e);
		}
	} else {
		triggerId = existingTrigger.getUniqueId(); // Use the existing trigger's ID
		// Optional: Check if the frequency needs updating? This adds complexity.
		// For simplicity, we assume the first frequency set is acceptable for all configs using the trigger.
	}

	// --- Store Configuration ---
	var configData = {
	  uniqueId: uniqueId,
	  eventNameSubstring: eventNameSubstring,
	  daysBefore: daysBefore,
	  functionToRun: functionToRun,
	  calendarId: calendarId, // Store calendarId used at time of setup
	  checkFrequencyHours: checkFrequencyHours, // Store the requested frequency
	  associatedTriggerId: triggerId // Link config to the (potentially shared) trigger ID
	};

	try {
		scriptProperties.setProperty(configPropKey, JSON.stringify(configData));
		// Also store a direct mapping from uniqueId to the triggerId for easier deletion/listing later
		scriptProperties.setProperty(triggerIdPropKey, triggerId);
		Logger.log('Configuration for uniqueId "%s" saved successfully.', uniqueId);

	} catch (e) {
		Logger.log('Error saving configuration to ScriptProperties: %s', e);
		// Attempt to delete the trigger *only if* we just created it and saving failed
		if (!existingTrigger && triggerId) {
		  Logger.log('Attempting to roll back trigger creation due to config save failure.');
		  try {
			 var triggers = ScriptApp.getProjectTriggers();
			 for (var k=0; k < triggers.length; k++){
				if (triggers[k].getUniqueId() === triggerId){
					ScriptApp.deleteTrigger(triggers[k]);
					Logger.log('Rolled back trigger creation (ID: %s).', triggerId);
					break;
				}
			 }
		   } catch (e2) {
			  Logger.log('Error trying to delete newly created trigger during rollback: %s', e2);
		   }
		}
		throw new Error('Failed to save trigger configuration. Error: ' + e);
	}
  };


  /**
   * The internal function executed by the recurring time-driven trigger.
   * It iterates through all stored configurations and checks for matching events.
   * THIS FUNCTION MUST BE PRESENT IN THE GLOBAL SCOPE for the trigger to call it.
   * @private Do not call directly. Triggered automatically.
   */
  function _CET_checkEventsAndTrigger() {
	var executionStartTime = new Date();
	Logger.log('Running scheduled check: _CET_checkEventsAndTrigger at %s', executionStartTime);
	var configs = namespace._internal._getAllConfigs();
	var cache = CacheService.getScriptCache(); // Use script cache for short-term locking (max 6 hours)

	if (configs.length === 0) {
	  Logger.log('No configurations found. Exiting check.');
	  // Optional: Consider self-deleting the trigger if no configs exist for a while?
	  // This is risky if setup is done infrequently. Manual cleanup is safer.
	  // var trigger = ScriptApp.getProjectTriggers().find(t => t.getHandlerFunction() === CHECK_FUNCTION_NAME);
	  // if (trigger) { ScriptApp.deleteTrigger(trigger); Logger.log("Deleting trigger as no configs found."); }
	  return;
	}

	var now = new Date(); // Use a consistent 'now' for all checks in this run

	configs.forEach(function(config) {
	  // Basic check if config object is valid before proceeding
	  if (!config || !config.uniqueId || !config.eventNameSubstring || !config.daysBefore || !config.functionToRun) {
		  Logger.log("Skipping invalid or incomplete configuration object: %s", JSON.stringify(config));
		  return; // Continue to next config
	  }

	  Logger.log('Checking config: uniqueId=%s, eventNameSubstring=%s, daysBefore=%s, functionToRun=%s',
				 config.uniqueId, config.eventNameSubstring, config.daysBefore, config.functionToRun);

	  var targetDate = new Date(now);
	  targetDate.setDate(now.getDate() + config.daysBefore);
	  targetDate.setHours(0, 0, 0, 0); // Start of the target day in script's timezone

	  var endTargetDate = new Date(targetDate);
	  endTargetDate.setDate(targetDate.getDate() + 1); // End of the target day (exclusive)

	  var calendar;
	  try {
		// Use the calendar ID stored in the config, falling back to current if needed (though setup requires it now)
		var calendarIdToCheck = config.calendarId || namespace.getConfiguredCalendarId();
		if (!calendarIdToCheck) {
			 Logger.log('Skipping config "%s": Calendar ID not found in config or global settings.', config.uniqueId);
			 return; // Skip this config if no calendar ID
		}
		calendar = CalendarApp.getCalendarById(calendarIdToCheck);
		 if (!calendar) {
			 // Log the calendar ID that failed
			 Logger.log('Skipping config "%s": Could not find or access calendar with ID "%s". Check ID and permissions.', config.uniqueId, calendarIdToCheck);
			 return; // Skip this config if calendar not accessible
		}
	  } catch (e) {
		  Logger.log('Error accessing calendar for config "%s": %s. Skipping check for this config.', config.uniqueId, e);
		  return; // Skip this config on error
	  }

	  try {
		// Fetch events for the specific day. Using search within getEvents is efficient.
		var events = calendar.getEvents(targetDate, endTargetDate, { search: config.eventNameSubstring });
		Logger.log('Found %s potential events on %s matching search "%s" for config "%s"',
				   events.length, targetDate.toLocaleDateString(), config.eventNameSubstring, config.uniqueId);

		events.forEach(function(event) {
		  var eventStartTime = event.getStartTime(); // Use actual start time for uniqueness and logging
		  var eventId = event.getId();
		  var eventTitle = event.getTitle(); // Get title once

		  // Refine filtering: Check if the event *actually* starts on the target date (especially for multi-day events)
		  // And verify substring match case-insensitively (Calendar search might be broader or case-sensitive depending on backend)
		  var eventStartDateOnly = new Date(eventStartTime);
		  eventStartDateOnly.setHours(0, 0, 0, 0); // Normalize event start date to compare with targetDate

		  // Compare normalized dates and perform case-insensitive substring check
		  if (eventStartDateOnly.getTime() === targetDate.getTime() &&
			  eventTitle.toLowerCase().indexOf(config.eventNameSubstring.toLowerCase()) !== -1)
		  {
				// Generate a cache key specific to this event instance (ID + start time)
				var cacheKey = namespace._internal._getEventCacheKey(eventId, eventStartTime);
				if (cache.get(cacheKey)) {
					Logger.log('Event "%s" (ID: %s, Start: %s) already processed recently (cache hit). Skipping callback for config "%s".',
							   eventTitle, eventId, eventStartTime, config.uniqueId);
					return; // Skip if already processed for this run or recent runs
				}

				Logger.log('MATCH FOUND for config "%s": Event "%s" (ID: %s, Start: %s) matches criteria. Preparing to call function: %s',
						   config.uniqueId, eventTitle, eventId, eventStartTime, config.functionToRun);

				try {
					// Ensure the callback function still exists before calling
					if (namespace._internal._functionExists(config.functionToRun)) {
						// Execute the user's specified global function, passing the event object
						var globalScope = this; // Get global scope
						globalScope[config.functionToRun](event); // Call the function by name

						// Mark as processed - cache for slightly less than the shortest check interval? Or fixed duration?
						// Cache duration should be long enough to prevent duplicates if the trigger runs slightly early/late or finishes quickly.
						// 6 hours (21600 seconds) is a reasonable default.
						cache.put(cacheKey, 'processed:' + new Date().toISOString(), 21600);
						Logger.log('Successfully called %s for event "%s" and cached key %s.', config.functionToRun, eventTitle, cacheKey);
					} else {
						 Logger.log('ERROR: Callback function "%s" specified in config "%s" no longer exists or is not a function. Cannot execute for event "%s".',
									config.functionToRun, config.uniqueId, eventTitle);
						// Cache a failure marker? Prevents repeated error logs but might hide persistent issues.
						// cache.put(cacheKey, 'error_func_missing', 21600);
					}

				} catch (e) {
					Logger.log('ERROR executing callback function "%s" for event "%s" (ID: %s, Config: "%s"). Error: %s',
							   config.functionToRun, eventTitle, eventId, config.uniqueId, e);
					// Log stack trace if available
					if (e.stack) {
						Logger.log('Stack trace: %s', e.stack);
					}
					// Add failed event to cache to prevent immediate retries hammering a failing function?
					cache.put(cacheKey, 'error:' + new Date().toISOString(), 3600); // Cache error state for 1 hour
				}
		  } else {
			   // This log can be noisy, uncomment for debugging date/string match issues specifically
			   // Logger.log('Event "%s" (Start: %s) found by search but did not meet exact criteria (Target Date: %s, Title Check: %s) for config "%s".',
			   // eventTitle, eventStartTime, targetDate, eventTitle.toLowerCase().indexOf(config.eventNameSubstring.toLowerCase()) !== -1, config.uniqueId);
		  }

		}); // End event loop

	  } catch (e) {
		// Catch errors during event fetching/processing for a single config
		Logger.log('Error processing events for config "%s": %s. Continuing to next config.', config.uniqueId, e);
		 if (e.stack) {
			 Logger.log('Stack trace: %s', e.stack);
		 }
	  }

	}); // End config loop

	 var executionEndTime = new Date();
	 var duration = (executionEndTime.getTime() - executionStartTime.getTime()) / 1000;
	 Logger.log('_CET_checkEventsAndTrigger finished at %s (Duration: %s seconds).', executionEndTime, duration);
  }

  // IMPORTANT: Make the check function globally accessible so the trigger can find it.
  // Assign it to the global scope ('this' at the top level).
  // The IIFE helps encapsulate helpers, but the trigger needs a global entry point.
  this._CET_checkEventsAndTrigger = _CET_checkEventsAndTrigger;

})(CalendarEventTriggers); // Pass the namespace object