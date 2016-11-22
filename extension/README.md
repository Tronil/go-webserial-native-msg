# nativemsgtest
Test of nativeMessaging

To use this webextension (as a developer) you need to do the following before manually loading the extension in firefox or chrome:

**Update the registry**
Run the following (or use regedit) with the appropriate path inserted:
Chrome: REG ADD "HKCU\Software\Google\Chrome\NativeMessagingHosts\gowebserial" /ve /t REG_SZ /d "C:\path\to\gowebserial_chrome.json" /f
Firefox: REG ADD "HKEY_CURRENT_USER\SOFTWARE\Mozilla\NativeMessagingHosts\gowebserial" /ve /d "C:\path\to\gowebserial.json" /f

**Update extension id in app manifest (Chrome)**
For Chrome only:
Load the extension into chrome and find its ID (something like "pmmajlahjokcgknoodfclcdhcngjfpee")
Edit the "allowed_origins" in gowebserial_chrome.json so it matches the ID

**Update the path in the app manifest**
Edit the "path" in gowebserial_firefox.json (for Firefox) and/or gowebserial_chrome.json (for Chrome) to point to the go-webserial.exe file

**Load the extension**
Load the extension manually (see the relevant browser docs) and off you go!