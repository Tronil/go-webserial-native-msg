'use strict';

const NMSerialPort = {
    openPromises: new Map(),

    addPromise(eventName, promise)
    {
        if (this.openPromises.has(eventName))
        {
            let promises = this.openPromises.get(eventName);
            promises.push(promise);
            this.openPromises.set(eventName, promises);
        }
        else
        {
            this.openPromises.set(eventName, [promise]);
        }        
    },

    removePromise(eventName, index)
    {
        let promises = this.openPromises.get(eventName);
        if (promises && promises.length > 1)
        {
            promises = promises.splice(index, 1);
        }
        else
        {
            this.openPromises.delete(eventName);
        }
    },

    sendMessage(message)
    {
        window.postMessage({ type: "togws", message: message }, "*");
    },

    closeAll()
    {
        this.openObjects.forEach( obj => {
            if(obj.id !== -1)
            {
                console.log("Closing port: ", obj);
                this.sendMessage({command: "close", id: obj.id});
                obj.id = -1;
            }
        });
    },

    handleSerialPortsEvent(message)
    {
        let promises = this.openPromises.get(message.event);
        if (promises)
        {
            for (let promise of promises)
            {
                if (promise.filters)
                {
                    promise.resolve(SerialPort.filterPorts(message.data, promise.filters));
                }
                else
                {
                    promise.resolve(message.data);
                }
            }
            this.openPromises.delete(message.event);
        }
    },

    handleSerialPortOpened(message)
    {
        let promises = this.openPromises.get(message.event);
        if (promises)
        {
            for (let i = 0; i < promises.length; i++)
            {
                if (promises[i].devicePath == message.devicePath)
                {
                    promises[i].object.id = message.id;
                    this.openObjects.push(promises[i].object);

                    promises[i].resolve(message.data);
                    this.removePromise(message.event, i);
                }
            }
        }        
    },

    handleData(message)
    {
        // Decode data into typed array
        let decodedString = atob(message.data);
        let uint8Array = new Uint8Array(decodedString.length);
        for (let i = 0; i < decodedString.length; i++)
        {
            uint8Array[i] = decodedString.charCodeAt(i);
        }

        // Find and call the relevant callback
        for (let openObject of this.openObjects)
        {
            if (openObject.id == message.id)
            {
                openObject.callback(uint8Array);
                break;
            }
        }
    },

    handleSerialPortClosed(message)
    {
        // Find the relevant object and change its state
        for (let i = 0; i < this.openObjects.length; i++)
        {
            if (this.openObjects[i].id == message.id)
            {
                this.openObjects[i].id = -1;
                if (this.openObjects[i].onCloseCallback)
                {
                    this.openObjects[i].onCloseCallback();
                }
                this.openObjects.splice(i, 1);
                break;
            }
        }        
    },

    handleError(message)
    {
        console.warn("Error occurred: " + message.error);
        let promises;
        let request;
        try {
            request = JSON.parse(message.inResponseTo);
        } catch (e) {
            console.log("ERROR:  Communication failed between browser and native messaging executable.  Closing connection!");
            // TODO: Graceful shutdown.
            return;
        }

        if (request && request.command)
        {
            switch (request.command)
            {
                case "listPorts":
                promises = this.openPromises.get("SerialPorts");
                if (promises)
                {
                    for (let promise of promises)
                    {
                        promise.reject(message.error);
                    }
                    this.openPromises.delete("SerialPorts");
                }
                break;

                case "open":
                promises = this.openPromises.get("PortOpen");
                if (promises)
                {
                    for (let i = 0; i < promises.length; i++)
                    {
                        if (promises[i].devicePath == request.devicePath)
                        {
                            promises[i].reject(message.error);
                            this.removePromise("PortOpen", i);
                        }
                    }
                }
                break;

                default:
                if (message.id)
                {
                    this.handleGenericErrorOnPort(message.id, message.error);
                }
                break;
            }
        }
        else if (message.id)
        {
            this.handleGenericErrorOnPort(message.id, message.error);
        }
    },

    handleGenericErrorOnPort(id, error)
    {
        for (let openObject of this.openObjects)
        {
            if (openObject.id == id)
            {
                if (openObject.onErrorCallback)
                {
                    openObject.onErrorCallback(error);
                }
                break;
            }
        }        
    },

    onWindowEvent(event)
    {

        // Communication with the content script

        // We only accept messages from this window with type set to fromgws
        if (event.source != window || event.data.type != "fromgws")
            return;
        const message = event.data.message;
        if (message.event)
        {
            switch (message.event)
            {
                case "SerialPorts":
                this.handleSerialPortsEvent(message);
                break;

                case "PortOpen":
                this.handleSerialPortOpened(message);
                break;

                case "data":
                this.handleData(message);
                break;

                case "PortClosed":
                this.handleSerialPortClosed(message);
                break;

                case "Error":
                this.handleError(message);
                break;
            }

        }
    },

    openObjects: [] // open serial port objects
};

window.addEventListener("message", NMSerialPort.onWindowEvent.bind(NMSerialPort));


// HACK: The following listeners are required to detect different combinations of reload, refresh and exit (force closes open ports)
// 'beforeunload' seems to work on reload via 'enter in address bar'
window.addEventListener('beforeunload', e => {
    NMSerialPort.closeAll();
});

// This code handles the F5/Ctrl+F5/Ctrl+R
document.addEventListener('keydown', e => {
    let keycode;
    if (window.event)
        keycode = window.event.keyCode;
    else if (e)
        keycode = e.which;

    if (keycode == 116 || (e.ctrlKey && keycode == 82)) {
        NMSerialPort.closeAll();
    }
});


class SerialPort {
    constructor(devicePath, modeOptions) {
        console.log("Creating a serial connection to ", devicePath);
        this.devicePath = devicePath;
        this.modeString = "";
        this.id = -1;
        if(modeOptions) {
            for(let key in modeOptions) {
                this.modeString += "&" + key + "=" + modeOptions[key];
            }
        }
    }

    static requestPorts(filters) {
        return new Promise(function(resolve, reject) {
            NMSerialPort.addPromise("SerialPorts", {resolve: resolve, reject: reject, filters: filters});

            NMSerialPort.sendMessage({command: "listPorts"});
        });
    }

    static filterPorts(portList, filters) {
        let result = [];

        portList.forEach( port => {
            if (!(filters instanceof Array))
            {
                filters = [filters];
            }

            for(let idx = 0; idx < filters.length; idx++) {
                let filter = filters[idx];
                for(let key in filter) {
                    if(port[key] !== filter[key]) {
                        return;
                    }
                }
            }
            result.push(port);
        });

        return result;
    }

    set onClose(callback) {
        this.onCloseCallback = callback;
    }

    get onClose() {
        return this.onCloseCallback;
    }

    set onError(callback) {
        this.onErrorCallback = callback;
    }

    get onError() {
        return this.onErrorCallback;
    }

    connect(callback) {
        this.callback = callback;
        return new Promise(function(resolve, reject) {
            NMSerialPort.addPromise("PortOpen", {resolve: resolve, reject: reject, object: this, devicePath: this.devicePath});

            NMSerialPort.sendMessage({ command: "open", devicePath: this.devicePath, baudRate: 57600 });

        }.bind(this));
    }

    disconnect() {
        if (this.id != -1)
        {
            NMSerialPort.sendMessage({command: "close", id: this.id});
        }
    }

    write(data) {
        if (this.id != -1)
        {
            // Convert data (ArrayBuffer format) to base64 string
            let uint8Array = new Uint8Array(data);
            let string = "";
            for (let i = 0; i < uint8Array.length; i++)
            {
                string += String.fromCharCode(uint8Array[i]);
            }

            NMSerialPort.sendMessage({command: "write", id: this.id, data: btoa(string)});
        }
    }
}
