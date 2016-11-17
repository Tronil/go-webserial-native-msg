/* jshint esversion: 6 */
console.log("Loaded native messaging js");

// Connect to background script
var backgroundScriptPort = chrome.runtime.connect();

window.addEventListener("message", event => {
	// We only accept messages from this window with type set to togws
	if (event.source != window || event.data.type != "togws")
		return;
	backgroundScriptPort.postMessage(event.data.message);
});

backgroundScriptPort.onMessage.addListener( m => {
	if (m.event) {
		// Forward to webpage
		window.postMessage({ type: "fromgws", message: m }, "*");
	} else if (m.debug)	{
		console.log("gws: debug: " + m.debug);
	}
});

backgroundScriptPort.onDisconnect.addListener( _ => {
	console.warn("Native application unexpected exit");
	window.postMessage({ type: "fromgws", message: {event: "AppExited"} }, "*");
});