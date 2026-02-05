# How to Transfer Fitness Tracker Between Computers

Since `localStorage` (where your workouts are saved) is specific to each browser on each computer, you need to manually sync your data.

## 1. Transferring App Data (Workouts, History, Settings)

To move your progress from **Computer A** to **Computer B**:

1.  **On Computer A (Source):**
    *   Open the Fitness Tracker App.
    *   Go to the **Profile** page.
    *   Scroll to the bottom "Data Management" section.
    *   Click **Export Backup**.
    *   **Save the JSON file to your Google Drive folder** (e.g., `fitness-tracker/backups/`).

2.  **On Computer B (Target):**
    *   Open the Fitness Tracker App.
    *   Go to the **Profile** page.
    *   Click **Import Backup**.
    *   Select the JSON file from your Google Drive folder.
    *   The app will reload with your up-to-date data.

> **Tip:** Do this whenever you switch computers to keep them in sync!

## 2. Transferring the App Source Code (To build/modify on new computer)

1.  **On Computer A:**
    *   Open the `fitness-tracker` folder.
    *   Double-click the **`pack_project.bat`** script.
    *   It will create a file named **`FitnessProject_Source_YYYY-MM-DD_HHmm.zip`**.
    *   **Upload this ZIP file to your Google Drive.**

2.  **On Computer B:**
    *   Download the latest `FitnessProject_Source_...zip` from your Drive.
    *   Extract/Unzip it to your Documents folder.
    *   Open that folder in VS Code / Antigravity.
    *   Double-click **`start_app.bat`** (it will automatically install necessary libraries and start the app).
