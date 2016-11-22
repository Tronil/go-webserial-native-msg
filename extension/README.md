# nativemsgtest
Test of nativeMessaging

To use this webextension (as a developer) you need to do the following before manually loading the extension in firefox or chrome:

## On Windows

### Update the path in the app manifest
Edit the "path" in gowebserial_firefox.json (for Firefox) and/or gowebserial_chrome.json (for Chrome) to point to the go-webserial-native-msg.exe file

### Update the registry
Either

a) edit chrome_windows.reg and firefox_windows.reg to match extension path (where this file is) and run them

or

b) do it manually by running the following (or use regedit) with the appropriate path inserted:
Chrome: REG ADD "HKCU\Software\Google\Chrome\NativeMessagingHosts\gowebserial" /ve /t REG_SZ /d "C:\path\to\gowebserial_chrome.json" /f
Firefox: REG ADD "HKEY_CURRENT_USER\SOFTWARE\Mozilla\NativeMessagingHosts\gowebserial" /ve /d "C:\path\to\gowebserial.json" /f

### Load the extension
Load the extension manually (see the relevant browser docs)

### Update extension id in app manifest (Chrome)
Load the extension into chrome and find its ID (something like "pmmajlahjokcgknoodfclcdhcngjfpee")
Edit the "allowed_origins" in gowebserial_chrome.json so it matches the ID
(save and reload)

## On Linux

### Update the path in the app manifest
Edit the "path" in gowebserial_firefox.json (for Firefox) and/or gowebserial_chrome.json (for Chrome) to point to the go-webserial-native-msg binary

Chrome: copy gowebserial_chrome.json to ~/.config/google-chrome/NativeMessagingHosts/ext.gowebserial.json
Firefox: copy gowebserial_firefox.json to ~/.mozilla/native-messaging-hosts/

### Load the extension
Load the extension manually (see the relevant browser docs)

### Update extension id in app manifest (Chrome only)
Load the extension into chrome and find its ID (something like "pmmajlahjokcgknoodfclcdhcngjfpee")
Edit the "allowed_origins" in ext.gowebserial.json so it matches the ID
(save and reload)

