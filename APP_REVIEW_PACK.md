# Tachyo – App Review Pack

Fill the **[BRACKETS]**, then use sections A–C in App Store Connect.

---

## A. App Review Information fields (version page → App Review Information)

- **Sign-in required:** ticked
- **User name:** [DEMO DRIVER ID]
- **Password:** [DEMO PIN]
- **Contact:** your name, phone, hello@tachyo.co.uk
- **Notes:** paste section B

> The login screen also needs a **Company code**. Apple's form has no field for it, so it is stated in the Notes.

## B. Notes text (paste into Notes AND into the Resolution Center reply)

```
Hello App Review team,

1. SCREEN RECORDING
[Link to video – unlisted YouTube/iCloud/Dropbox, no login needed]
Recorded on a physical iPhone, [model], iOS [latest]. It starts with app launch and shows: login, location permission prompts, clock in, vehicle selection, walk-around check, a load with proof-of-delivery photo, shift history, holiday request, clock out, sign out.

2. PURPOSE AND TARGET AUDIENCE
Tachyo is a driver app for employees of haulage and logistics companies that use the Tachyo fleet platform (pricing and sign-up for companies: https://[YOUR DOMAIN]/pricing). It replaces paper and phone-call driver admin: drivers clock in/out inside a depot geofence, select tractor/trailer, complete walk-around checks, receive and complete loads from their dispatcher, capture proof of delivery (timestamped, GPS-tagged photos or on-screen recipient signature), log fuel and parking, request holiday, and see their hours and pay. The employer's office sees the same data in a web dashboard.
The app is offered to many unrelated companies, not a single organisation. It is free; there are no in-app purchases or paid features inside the app.

3. HOW TO ACCESS THE MAIN FEATURES
There is no public sign-up: employers create driver accounts. Use this demo account:
 - Company code: oskar-ltd
 - Driver ID: APPLE.REVIEW
 - PIN: [DEMO PIN]
Walkthrough: sign in > allow location (While Using, then Always when asked) > Clock in [state exactly how: the demo depot geofence covers any location / is set to a large radius] > choose vehicle > complete walk-around check > open the assigned demo load, accept, record odometer, add a POD photo or signature, finish > History tab > request holiday > Clock out > Sign out.

4. EXTERNAL SERVICES
 - Supabase – database, authentication, file storage, server functions
 - OpenFreeMap / OpenStreetMap – map tiles (no account or key)
 - Apple Core Location (via the Tracelet plugin) – geofenced clock-in, route during an active shift, photo geotagging
 - On-device local notifications only
No payment processors, advertising, analytics, crash-reporting or AI services. No tracking.

BACKGROUND LOCATION
Background location is used only while the driver is clocked in on an active shift, so the employer's dispatch can see position and confirm deliveries. It stops at clock-out. The iOS location indicator is visible while it runs. It is not used for advertising or sold.

5. REGIONAL DIFFERENCES
The app works identically in all regions. Currency, dates and rules follow the employer's configuration. It is mainly used in the UK.

6. REGULATED INDUSTRY / THIRD-PARTY MATERIAL
Tachyo is not a regulated service and contains no third-party protected content. It records driver hours, vehicle defect checks and delivery evidence for employers who hold goods-vehicle operator licences. Privacy notice and DPA: https://[YOUR DOMAIN]/legal

ACCOUNTS, DELETION AND USER CONTENT
Driver accounts are issued and managed by the employer (the data controller); the app has no self-registration. Account deletion: a driver can tap "Request Account Deletion" on the login screen (signed out, using company code + Driver ID) or in Settings > Account (signed in). The request appears in the employer's web dashboard (Alert Panel > Account Deletion Requests); once the employer confirms, the driver's account and all attached data (shifts, locations, checks, reports, receipts, holidays, rota and the sign-in) are permanently deleted. Drivers can also email support@tachyo.co.uk. The app has no social features, no public content and no user-to-user messaging; photos, signatures and reports are private to the driver's employer, so reporting/blocking mechanisms do not apply.
```

## C. Short reply for the Resolution Center (above the Notes text)

```
Thank you. We have added the requested information to the Notes field of App Review Information and below. We have also added a privacy manifest and a demo account that works from any location. Please let us know if you need anything further.
```

---

## D. Checklist – do these BEFORE resubmitting

| # | Task | Why |
|---|------|-----|
| 1 | Create the demo company, demo depot, vehicle, trailer and one pre-assigned load in the live Supabase | Reviewer must reach every feature without help (2.1) |
| 2 | Demo depot "Doncaster Hub" is currently 450 m. Set its radius to 20000000 m (any location) so the reviewer can clock in from anywhere | Reviewer is not at your depot, the most likely cause of rejection |
| 3 | Check the demo login works on a fresh install, on a phone | Dead credentials = instant rejection |
| 4 | Record the video (script below), upload unlisted, put the link in B | Required by Apple |
| 5 | Set **App Privacy** answers in App Store Connect to match the manifest: Precise Location, Photos, Name, User ID – linked to user, not used for tracking | Mismatch is a 5.1.1 rejection |
| 6 | Privacy Policy URL set on the app page; works and mentions location | Required |
| 7 | Screenshots must show the real app in use (not login/splash) – yours already in `appstore-shots/final` | 2.3.3 |
| 8 | Make sure /pricing and /legal pages are live and linked | Supports "many companies" answer (3.2) |
| 9 | Build a new IPA with the new PrivacyInfo.xcprivacy (Codemagic), upload, select it in the version | The manifest only counts once built |
| 10 | Confirm on a real iPhone: tracking stops after clock-out and after reboot | Reviewers test background location |
| 11 | ~~Add "Request account deletion" in the app~~ DONE in code (login screen + Settings) – ships with the new native build | 5.1.1(v) |
| 12 | If rejected again under 3.2: request **Unlisted App** distribution | Fallback |

## E. Screen recording script (about 3–4 minutes, physical iPhone, screen record)

1. Start from the Home Screen. Tap the Tachyo icon (launch must be visible).
2. Login screen: type company code, driver ID, PIN. Sign in.
3. Show the location prompts and tap Allow (While Using, then Always).
4. Clock in. Pick tractor and trailer.
5. Complete the walk-around check; submit one defect with a photo (shows camera permission).
6. Open the assigned load: accept, enter odometer, take POD photo or signature, finish.
7. Open History/shifts and show hours and pay. Show the map screen.
8. Submit a holiday request.
9. Clock out (say aloud/caption: "background tracking stops here").
10. Profile/Settings: show legal/privacy page; show account-deletion request if added.
11. Sign out.
No paid content exists, so say so in the caption or notes.
