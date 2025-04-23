# Google Apps Script - Calendar Event Trigger Library

This library provides a reusable framework for triggering custom Google Apps Script functions based on upcoming events in a specified Google Calendar.

It uses a **recurring check model** for robustness and scalability, avoiding the limitations of creating numerous individual future triggers. A single time-driven trigger runs periodically (e.g., daily or hourly) and executes your callback function *only when* an event matching your criteria (e.g., "Event titled 'Meeting' starts in 3 days") is found.

## Features

* **Configure Target Calendar:** Specify which calendar to monitor.
* **Set Up Event Checks:** Define criteria based on:
	* Event name substring (case-insensitive).
	* Number of days before the event's start date.
	* The specific global function in your script to call when criteria are met.
* **Recurring Check:** Automatically sets up and manages a single time-driven trigger to perform checks periodically.
* **Callback Execution:** Executes your specified function, passing the matching Google Calendar `Event` object as an argument.
* **Duplicate Prevention:** Uses caching (`CacheService`) to avoid executing the callback multiple times for the same event instance if the check runs frequently or takes time.
* **Manage Configurations:**
	* List all active event check configurations.
	* Get configuration details by unique ID or event substring.
	* Delete specific configurations and automatically clean up the associated recurring trigger if it's no longer needed by any configuration.
	* Delete *all* configurations and triggers created by this library.
* **List Triggers:** List the actual recurring trigger(s) managed by the library (useful for debugging).
* **Simulation Mode:** Test your setup logic and check function behavior by simulating the process and logging what *would* happen based on current calendar events, without actually executing callbacks or modifying triggers/properties.
* **Namespaced:** All functions are under the `CalendarEventTriggers` namespace to prevent collisions with your own script functions.
* **Organized Code:** Functions are separated into logical files (`Config.gs`, `CoreTriggers.gs`, etc.) for easier maintenance.

## Installation

1.  In your Google Apps Script project (script.google.com), create the following script files (using `+ > Script` in the editor):
	* `CalendarEventTriggers.gs`
	* `Config.gs`
	* `Utils.gs`
	* `RecurringCheck.gs`
	* `CoreTriggers.gs`
	* `TestFunctions.gs`
2.  Copy the code from each corresponding section provided previously into these files. Ensure the file names match exactly.
3.  **Important:** The function `_CET_checkEventsAndTrigger` defined in `RecurringCheck.gs` is intended to be called by the Apps Script trigger system. The provided code ensures it's globally accessible. Do not rename or move this function without understanding the implications for the trigger setup.
4.  Optionally, create a `README.md` file (`+ > HTML` - then rename) and paste the contents of this README section into it for documentation within your project.

## Authorization

The script requires authorization for the following Google Workspace services the first time you run a function that needs them (or when a trigger runs):

* **Google Calendar API:** To read events from the specified calendar (`CalendarApp`).
* **Script runtime:** To create and manage script triggers (`ScriptApp`).
* **Script properties:** To store configuration (`PropertiesService`).
* **Cache service:** To prevent duplicate executions (`CacheService`).

You will typically be prompted for authorization when you first run a function like `setCalendarId`, `setupRecurringCheck`, or `simulateCheck` from the script editor. Ensure you grant the necessary permissions.

## Usage

**1. Configure the Calendar**

First, tell the library which calendar to monitor. Find your Calendar ID in Google Calendar:
* Go to Settings (gear icon) > Settings.
* On the left, under "Settings for my calendars", click the calendar you want to use.
* Scroll down to the "Integrate calendar" section.
* Copy the **Calendar ID** (it often looks like an email address, especially for your primary calendar).

Create and run a function like this once from the Apps Script editor:

```javascript
function configureMyCalendar() {
  // Replace with the actual Calendar ID you copied
  var myCalendarId = 'YOUR_CALENDAR_ID_HERE'; // e.g., 'your.email@example.com' or 'xxxxxxxxxx@group.calendar.google.com'
  try {
	  CalendarEventTriggers.setCalendarId(myCalendarId);
	  Logger.log('Successfully set calendar ID.');
  } catch (e) {
	  Logger.log('Error setting calendar ID: %s', e);
	  // Consider adding more robust error handling or UI feedback here
  }
}