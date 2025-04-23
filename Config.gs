/**
 * @file Config.gs
 * @description Configuration functions for the CalendarEventTriggers library.
 */

(function(namespace) {

  var SCRIPT_PROP_KEY_CALENDAR_ID = 'CET_CALENDAR_ID'; // CET for CalendarEventTriggers

  /**
   * Sets the ID of the Google Calendar to monitor for events.
   * Find your Calendar ID in Google Calendar > Settings > Settings for my calendars > Select calendar > Integrate calendar > Calendar ID.
   * For the primary calendar, it's usually your email address.
   *
   * @param {string} calendarId The ID of the calendar to use.
   */
  namespace.setCalendarId = function(calendarId) {
	if (!calendarId || typeof calendarId !== 'string') {
	  throw new Error('Invalid Calendar ID provided. Must be a non-empty string.');
	}
	PropertiesService.getScriptProperties().setProperty(SCRIPT_PROP_KEY_CALENDAR_ID, calendarId);
	Logger.log('Calendar ID set to: %s', calendarId);
  };

  /**
   * Gets the currently configured Calendar ID.
   *
   * @returns {string|null} The configured Calendar ID, or null if not set.
   */
  namespace.getConfiguredCalendarId = function() {
	return PropertiesService.getScriptProperties().getProperty(SCRIPT_PROP_KEY_CALENDAR_ID);
  };

  /**
   * Gets the Calendar object based on the configured ID.
   * Throws an error if the ID is not set or the calendar is not found/accessible.
   * @private Internal helper function.
   * @returns {Calendar} The Google Apps Script Calendar object.
   */
  function _getCalendar() {
	var calendarId = namespace.getConfiguredCalendarId();
	if (!calendarId) {
	  throw new Error('Calendar ID not configured. Please run CalendarEventTriggers.setCalendarId(id) first.');
	}
	var calendar = CalendarApp.getCalendarById(calendarId);
	if (!calendar) {
	  throw new Error('Could not find or access Calendar with ID: ' + calendarId + '. Please check the ID and sharing permissions.');
	}
	return calendar;
  }

  // Expose the private helper if needed internally by other library files
  namespace._internal = namespace._internal || {};
  namespace._internal._getCalendar = _getCalendar;


})(CalendarEventTriggers); // Pass the namespace object