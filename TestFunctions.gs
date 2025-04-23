/**
 * @file TestFunctions.gs
 * @description Simulation functions for testing trigger logic without side effects.
 */

(function(namespace) {

  namespace.test = {}; // Create a sub-namespace for test functions

  /**
   * Simulates the check process for a specific configuration or all configurations.
   * Logs the events that *would* trigger a callback based on current calendar data.
   * Does NOT call any user-defined functions, modify properties, or use cache.
   *
   * @param {string} [uniqueId] Optional. If provided, only simulates the check for this specific configuration uniqueId. If omitted, simulates for ALL configurations stored in properties.
   */
  namespace.test.simulateCheck = function(uniqueId) {
	Logger.log('--- Starting Simulation Run ---');
	var configsToCheck = [];
	var simulationErrors = false;

	try {
		if (uniqueId) {
			// Use the library's own getter to find the config
			var config = namespace.getConfigByUniqueId(uniqueId);
			if (config) {
				configsToCheck.push(config);
				Logger.log('Simulating check for specific uniqueId: %s', uniqueId);
			} else {
				Logger.log('Simulation Error: Configuration with uniqueId "%s" not found in properties.', uniqueId);
				simulationErrors = true;
				// End simulation here if specific ID not found? Or continue if simulating all?
				// Let's stop if a specific invalid ID was given.
				 Logger.log('--- Simulation Run Finished (Error) ---');
				 return;
			}
		} else {
			configsToCheck = namespace.listAllConfigs(); // Use the library's lister
			if (configsToCheck.length === 0) {
				Logger.log('Simulation Info: No configurations found in properties to simulate.');
				Logger.log('--- Simulation Run Finished ---');
				return;
			}
			Logger.log('Simulating check for all %s configuration(s) found in properties.', configsToCheck.length);
		}
	} catch (e) {
		Logger.log("Simulation Error retrieving configurations: %s", e);
		simulationErrors = true;
		// End simulation if configs can't be retrieved
		Logger.log('--- Simulation Run Finished (Error) ---');
		return;
	}


	var now = new Date(); // Consistent 'now' for the simulation run

	configsToCheck.forEach(function(config) {
	  // Validate config object before simulation
	  if (!config || !config.uniqueId || !config.eventNameSubstring || !config.daysBefore || !config.functionToRun) {
		  Logger.log('Simulation Skip: Invalid or incomplete configuration object found: %s', JSON.stringify(config));
		  simulationErrors = true;
		  return; // Continue to next config
	  }

	  Logger.log('--- Simulating Config: uniqueId="%s", eventNameSubstring="%s", daysBefore=%s, functionToRun=%s ---',
				 config.uniqueId, config.eventNameSubstring, config.daysBefore, config.functionToRun);

	  var targetDate = new Date(now);
	  targetDate.setDate(now.getDate() + config.daysBefore);
	  targetDate.setHours(0, 0, 0, 0); // Start of the target day in script's timezone

	  var endTargetDate = new Date(targetDate);
	  endTargetDate.setDate(targetDate.getDate() + 1); // End of the target day (exclusive)
	  Logger.log('  Target Date Range (Script Timezone): %s to %s', targetDate, endTargetDate);


	  var calendar;
	   try {
		// Use the calendar ID stored in the config, falling back to current global setting
		var calendarIdToCheck = config.calendarId || namespace.getConfiguredCalendarId();
		if (!calendarIdToCheck) {
			 Logger.log('  Simulation Skip (Config "%s"): Calendar ID not found in config or global settings.', config.uniqueId);
			 return; // Skip this config simulation
		}
		Logger.log('  Attempting to access calendar ID: %s', calendarIdToCheck);
		calendar = CalendarApp.getCalendarById(calendarIdToCheck);
		 if (!calendar) {
			 Logger.log('  Simulation Skip (Config "%s"): Could not find or access calendar "%s". Check ID and permissions.', config.uniqueId, calendarIdToCheck);
			 return; // Skip this config simulation
		}
	  } catch (e) {
		  Logger.log('  Simulation Error (Config "%s") accessing calendar: %s. Skipping simulation for this config.', config.uniqueId, e);
		  simulationErrors = true;
		  return; // Skip this config simulation on error
	  }

	  try {
		// Fetch events using the same logic as the real check
		var events = calendar.getEvents(targetDate, endTargetDate, { search: config.eventNameSubstring });
		Logger.log('  Simulation found %s potential events on %s using search "%s"',
				   events.length, targetDate.toLocaleDateString(), config.eventNameSubstring);

		var matchesFound = 0;
		if (events.length > 0) {
			events.forEach(function(event) {
			  var eventStartTime = event.getStartTime();
			  var eventId = event.getId();
			  var eventTitle = event.getTitle();

			  // Apply the same filtering logic as the real check function
			  var eventStartDateOnly = new Date(eventStartTime);
			  eventStartDateOnly.setHours(0, 0, 0, 0); // Normalize

			  Logger.log('    Checking Event: "%s" (ID: %s, Start: %s)', eventTitle, eventId, eventStartTime);

			  // Perform the checks and log the outcome
			  var dateMatch = eventStartDateOnly.getTime() === targetDate.getTime();
			  var titleMatch = eventTitle.toLowerCase().indexOf(config.eventNameSubstring.toLowerCase()) !== -1;

			  Logger.log('      Date Match (Event Start Date == Target Date)? %s (%s vs %s)', dateMatch, eventStartDateOnly.toDateString(), targetDate.toDateString());
			  Logger.log('      Title Match (Contains "%s", case-insensitive)? %s', config.eventNameSubstring, titleMatch);


			  if (dateMatch && titleMatch)
			  {
					Logger.log('    ---> SIMULATED TRIGGER: Event "%s" meets criteria.', eventTitle);
					Logger.log('         Would call function: %s', config.functionToRun);
					Logger.log('         Event Details: ID=%s, Start=%s, AllDay=%s', eventId, eventStartTime, event.isAllDayEvent());
					matchesFound++;
			  } else {
					Logger.log('    --- No Match: Event "%s" does not meet all criteria.', eventTitle);
			  }
			}); // End event loop
		}

		if (matchesFound === 0) {
			Logger.log('  Simulation Result: No events met the exact criteria for this configuration on the target date.');
		} else {
			 Logger.log('  Simulation Result: Found %s event(s) that would trigger the callback.', matchesFound);
		}

	  } catch (e) {
		Logger.log('  Simulation Error fetching/processing events for config "%s": %s', config.uniqueId, e);
		if (e.stack) Logger.log('  Stack: %s', e.stack);
		simulationErrors = true;
	  }
	  Logger.log('--- Finished Simulating Config: %s ---', config.uniqueId);

	}); // End config loop

	if (simulationErrors) {
		 Logger.log('--- Simulation Run Finished (with errors) ---');
	} else {
		 Logger.log('--- Simulation Run Finished Successfully ---');
	}
  };


  /**
   * Simulates setting up a recurring check. Logs the details that *would* be used
   * but does NOT create/modify Script Properties or Script Triggers.
   * Useful for verifying parameters before actual setup.
   *
   * @param {string} eventNameSubstring The text to search for within event names.
   * @param {number} daysBefore Positive integer representing how many days before the event start date.
   * @param {string} functionToRun The exact name of the GLOBAL function intended to execute.
   * @param {number} [checkFrequencyHours=6] Optional. How often (in hours) the check should run. Min 1. Defaults to 6.
   * @param {string} [uniqueId=eventNameSubstring + functionToRun] Optional. A unique identifier.
   */
   namespace.test.simulateSetupRecurringCheck = function(eventNameSubstring, daysBefore, functionToRun, checkFrequencyHours, uniqueId) {
	   Logger.log('--- Simulating SetupRecurringCheck ---');
	   var paramsValid = true;

	   // Perform and log validation checks
	   if (!eventNameSubstring || typeof eventNameSubstring !== 'string') {
		   Logger.log('Simulation Validation FAIL: eventNameSubstring must be a non-empty string.');
		   paramsValid = false;
	   }
	   if (typeof daysBefore !== 'number' || !Number.isInteger(daysBefore) || daysBefore <= 0) {
		   Logger.log('Simulation Validation FAIL: daysBefore must be a positive integer.');
		   paramsValid = false;
	   }
	   if (!functionToRun || typeof functionToRun !== 'string') {
		   Logger.log('Simulation Validation FAIL: functionToRun must be a non-empty string (the function name).');
		   paramsValid = false;
	   } else {
			// Check if function exists, but log as info/warning in simulation
			if (!namespace._internal._functionExists(functionToRun)) {
				Logger.log('Simulation Validation WARNING: The specified functionToRun "%s" does not currently exist or is not a function in the global scope. Ensure it is defined before actual setup.', functionToRun);
				// Allow simulation to proceed even if function isn't defined yet
			}
	   }

	   checkFrequencyHours = (typeof checkFrequencyHours === 'number' && checkFrequencyHours >= 1) ? Math.ceil(checkFrequencyHours) : 6; // Apply default/validation
	   uniqueId = uniqueId || (eventNameSubstring + '_' + functionToRun); // Apply default

	   var calendarId = namespace.getConfiguredCalendarId(); // Check if calendar is configured
		if (!calendarId) {
			 Logger.log('Simulation Validation WARNING: Calendar ID is not configured. Run CalendarEventTriggers.setCalendarId(id) before actual setup.');
			 // Allow simulation to proceed but highlight the missing config
		}

	   Logger.log('Simulation Parameters:');
	   Logger.log('  uniqueId: %s', uniqueId);
	   Logger.log('  eventNameSubstring: %s', eventNameSubstring);
	   Logger.log('  daysBefore: %s', daysBefore);
	   Logger.log('  functionToRun: %s', functionToRun);
	   Logger.log('  checkFrequencyHours: %s', checkFrequencyHours);
	   Logger.log('  Target Calendar ID (currently configured): %s', calendarId || 'Not Set!');

	   if (paramsValid && calendarId) {
		   Logger.log('--- Simulation Actions (Would Occur) ---');
		   Logger.log('  1. Check if configuration with uniqueId "%s" already exists in ScriptProperties.', uniqueId);
		   Logger.log('  2. Check if a trigger running "%s" already exists.', '_CET_checkEventsAndTrigger');
		   Logger.log('  3. If trigger doesn\'t exist, create new time-based trigger running "%s" every %s hours.', '_CET_checkEventsAndTrigger', checkFrequencyHours);
		   Logger.log('  4. Store configuration data in ScriptProperties under key like: %s', namespace._internal._getConfigPropKey(uniqueId));
		   Logger.log('  5. Store trigger ID mapping in ScriptProperties under key like: %s', namespace._internal._getTriggerIdPropKey(uniqueId));
	   } else {
			Logger.log('--- Simulation Actions (Would NOT Proceed due to validation issues) ---');
	   }

	   Logger.log('--- Simulation Finished ---');
   };


})(CalendarEventTriggers); // Pass the namespace object