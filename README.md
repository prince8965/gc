# 🗑️ Garbage Collector
### Smart Garbage Collection and Report Management System Using GeoCamera and GPS Location

A mobile-first web application that connects citizens, garbage collectors, and administrators to improve urban waste management through geotagged waste reporting, GPS tracking, Google Maps integration, and priority-based garbage collection.

---

## 📌 1. Project Overview

**Garbage Collector** is a smart waste management and report management system designed to make garbage reporting and collection more efficient.

Citizens can report garbage problems using their phone's camera and GPS location. The system stores the report, identifies its service area, and makes it available to the appropriate garbage collector.

Garbage collectors can view assigned-area reports, navigate to the reported location, start cleaning, and upload an after-cleaning photograph.

Administrators can manage users, service areas, reports, collector assignments, priorities, and system activities.

The main goal is to improve communication between citizens and municipal waste collection teams while making garbage collection more transparent and organized.

---

## 🎯 2. Project Objectives

- Make garbage reporting simple and accessible.
- Capture real-time GPS coordinates with report photographs.
- Identify the service area of each garbage report.
- Connect reports with the appropriate garbage collector.
- Display garbage reports on Google Maps.
- Prioritize locations based on severity and repeated reports.
- Track cleaning progress and completion.
- Improve accountability through before-and-after photographs.

---

## ✨ 3. Key Features

### 👤 Citizen Module

- Simple Citizen login.
- Capture garbage photographs using the built-in GeoCamera.
- Capture GPS latitude and longitude.
- Store location accuracy where available.
- Submit garbage reports with category, severity, and description.
- View submitted reports and their status.
- Track cleaning progress.

### 🚛 Garbage Collector Module

- Simple Collector login.
- View reports from the assigned service area.
- Receive report notifications.
- View report photographs and location details.
- View report locations on Google Maps.
- Navigate to reported locations.
- Start cleaning.
- Capture and upload after-cleaning photographs.
- Mark reports as resolved after successful evidence upload.

### 🛡️ Administrator Module

- Admin dashboard.
- Manage citizens and garbage collectors.
- Create and manage service areas.
- Assign collectors to service areas.
- View and manage garbage reports.
- Monitor report status and priority.
- View garbage locations on Google Maps.
- Monitor collection activities and statistics.

---

## 📸 4. GeoCamera and GPS Integration

GeoCamera is one of the main features of this project.

The Citizen can capture a photograph directly through the website using the device camera.

The system collects:

- Waste photograph.
- GPS latitude.
- GPS longitude.
- Location accuracy, when available.
- Report creation timestamp.
- Citizen account reference.

This information is associated with the submitted report to support location-based verification and monitoring.

**Note:** GPS coordinates and photographs provide supporting evidence but do not independently prove that an image is authentic.

---

## 🗺️ 5. Google Maps Integration

Google Maps is used to visualize garbage reports geographically.

Features include:

- Display report locations using map markers.
- View report details from map locations.
- Identify garbage hotspots.
- Help collectors navigate to reported locations.
- Support location-based report management.

A properly configured Google Maps API key is required.

---

## ⚙️ 6. Technology Stack

| Technology | Purpose |
|---|---|
| HTML5 | Web page structure |
| CSS3 | Styling and responsive design |
| JavaScript | Frontend functionality |
| Supabase | Backend and database |
| PostgreSQL | Relational database |
| Supabase Auth | User sessions and authentication |
| Supabase Storage | Before-and-after photographs |
| Supabase Realtime | Live data and notifications |
| Google Maps JavaScript API | Map visualization |
| Browser Geolocation API | GPS location |
| Browser MediaDevices API | Camera access |

---

## 🏗️ 7. System Architecture

```text
             CITIZEN
                |
                v
       Capture Waste Photo
                |
                v
        Capture GPS Location
                |
                v
        Submit Garbage Report
                |
                v
       SUPABASE BACKEND
                |
       +--------+--------+
       |                 |
       v                 v
   PostgreSQL       Supabase Storage
   Database         Before Photo
       |
       v
  Identify Service Area
       |
       v
  Collector Assignment
       |
       v
  Priority Calculation
       |
       v
  Collector Notification
       |
       v
  COLLECTOR DASHBOARD
       |
       v
  View Report and Map
       |
       v
    Start Cleaning
       |
       v
  Upload After Photo
       |
       v
   Resolve Report
       |
       v
  Citizen Status Update
```

---

## 🔄 8. Report Workflow

1. Citizen logs into the website.
2. Citizen opens the Report Waste section.
3. Citizen captures a photograph using GeoCamera.
4. The website requests GPS location permission.
5. Citizen selects the waste category and severity.
6. The report is submitted to Supabase.
7. The system identifies the appropriate service area.
8. The appropriate Collector can view the report.
9. Collector receives a notification.
10. Collector visits the location and starts cleaning.
11. Collector uploads an after-cleaning photograph.
12. Report status changes to RESOLVED after successful completion.

---

## 🗄️ 9. Database and Storage

The project uses Supabase PostgreSQL and Supabase Storage.

Main database tables include:

- `profiles` – User profiles and roles.
- `user_sessions` – Application session information.
- `service_areas` – Garbage collection service areas.
- `reports` – Garbage reports and their details.
- `notifications` – User notifications.
- `report_status_history` – Report status changes.
- `audit_logs` – Important system activities.

### Report Statuses

| Status | Description |
|---|---|
| PENDING | Newly submitted report |
| OPEN | Legacy pending report status |
| IN_PROGRESS | Collector has started cleaning |
| RESOLVED | Cleaning completed successfully |

### Storage

The private Supabase Storage bucket is named:

`garbage-reports`

Expected image paths:

```text
before/<citizen_id>/<filename>
after/<report_id>/<filename>
```

Storage access is controlled through policies.

---

## 🚀 10. Installation and Setup

### Prerequisites

Install the following:

- Node.js
- Visual Studio Code
- Git
- Supabase account
- Google Maps API key

### Step 1: Clone the Repository

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
```

Navigate to the project directory:

```bash
cd garbage-collector
```

### Step 2: Configure Environment

Configure your Supabase and Google Maps credentials using the project's existing configuration system.

For example, if your project uses `config/env.js`, configure:

```javascript
window.ENV = {
  SUPABASE_URL: "YOUR_SUPABASE_URL",
  SUPABASE_PUBLISHABLE_KEY: "YOUR_SUPABASE_PUBLISHABLE_KEY",
  GOOGLE_MAPS_API_KEY: "YOUR_GOOGLE_MAPS_API_KEY"
};
```

Use the actual configuration format expected by your application.

**Security:**
- Never expose your Supabase service-role key in frontend code.
- Never commit private credentials to GitHub.
- Restrict your Google Maps API key by website referrer and API.
- Ensure Supabase Row Level Security is enabled.

### Step 3: Configure Supabase

For a new empty database, review the SQL setup files and use:

```text
supabase/RUN_ALL_SETUP.sql
```

For an existing database, do not run the fresh-install script. Review and apply only the appropriate upgrade migration:

```text
supabase/06_fix_priority_trigger_and_guards.sql
```

Take a backup and review the migration before executing it in the Supabase SQL Editor.

### Step 4: Run the Website

Start a local development server from the project directory:

```bash
npx serve .
```

Open the local URL displayed in the terminal.

Camera and GPS features require a secure context, such as HTTPS or localhost, and appropriate browser permissions.

---

## 🔐 11. Security Features

- Supabase Row Level Security (RLS).
- Role-based access control.
- Collector service-area restrictions.
- Private image storage.
- Protected report fields.
- Controlled report status transitions.
- Restricted database function permissions.
- Secure environment configuration.

The simple Name + Phone login interface is intended for project demonstration and does not independently verify a user's real-world identity.

---

## 🧪 12. Testing Checklist

| Test Case | Expected Result |
|---|---|
| Citizen login | Citizen dashboard opens |
| GeoCamera | Camera captures a photograph |
| GPS | Location coordinates are captured |
| Report submission | Report is saved in database |
| Area identification | Correct service area is identified |
| Collector dashboard | Correct Collector sees the report |
| Notifications | Appropriate Collector is notified |
| Google Maps | Report location appears on map |
| Start cleaning | Report changes to IN_PROGRESS |
| After-photo upload | Photograph is stored successfully |
| Resolve report | Status changes to RESOLVED |
| Admin dashboard | Admin can monitor reports and users |
| RLS | Unauthorized users cannot access protected data |

Testing should be performed against an isolated test environment before production deployment.

---

## 🌱 13. Future Scope

- AI-based garbage classification.
- Automatic garbage hotspot detection.
- Predictive waste collection scheduling.
- Smart dustbin integration using IoT.
- Optimized garbage collection routes.
- SMS and push notifications.
- Advanced image verification.
- Multilingual support.
- Municipal corporation integration.
- Advanced analytics and reporting.

---

## 🌍 14. Social Impact

The project supports cleaner and more sustainable urban environments.

It aligns with the objectives of:

- **SDG 11:** Sustainable Cities and Communities.
- **SDG 12:** Responsible Consumption and Production.
- **SDG 3:** Good Health and Well-being.

It also supports the broader goals of the Swachh Bharat Mission.

---

## 👨‍💻 15. Project Information

**Project Name:** Garbage Collector

**Project Type:** College Idea Lab Project

**Theme:** Urban System

**Domain:** Smart Waste Management

**Core Technologies:** HTML, CSS, JavaScript, Supabase, PostgreSQL, Google Maps API

**Developer:** Prince Vishwakarma

---

## 📄 16. License

This project is developed for educational and academic purposes. Add an appropriate open-source license if you intend to distribute or reuse the project publicly.

---

### Garbage Collector
**Capture. Report. Collect. Keep Our City Clean.** 🌱
