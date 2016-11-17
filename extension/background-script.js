/* jshint esversion: 6 */
var contentScriptPort = null;
var nativeAppPort = null;

function messageFromContent(message) {
	//console.log("Message received from content script:\n " + JSON.stringify(message));
	if (nativeAppPort) {
		nativeAppPort.postMessage(message);
	}
}

function contentScriptPortDisconnected() {
	contentScriptPort = null;
	nativeAppPort.disconnect();
	nativeAppPort = null;
}

function messageFromNativeApp(message) {
	//console.log("messageFromNativeApp: " + message)
	contentScriptPort.postMessage(message);	
}

function nativeAppDisconnected() {
	nativeAppPort = null;
	if (contentScriptPort) {
		contentScriptPort.disconnect();
		contentScriptPort = null;
	}
}

function startNativeApp() {
	if (!nativeAppPort) {
		nativeAppPort = chrome.runtime.connectNative("gowebserial");
		nativeAppPort.onMessage.addListener(messageFromNativeApp);
		nativeAppPort.onDisconnect.addListener(nativeAppDisconnected);
	}
}

// Listen for a connection from the content script
chrome.runtime.onConnect.addListener( port => {
	contentScriptPort = port;
	contentScriptPort.onMessage.addListener(messageFromContent);
	contentScriptPort.onDisconnect.addListener(contentScriptPortDisconnected);

	startNativeApp();
});

