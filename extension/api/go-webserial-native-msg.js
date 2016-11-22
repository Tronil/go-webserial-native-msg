'use strict';

var NMSerialPort;
NMSerialPort = {
    openPromises: new Map(),

    addPromise: function(eventName, promise)
    {
        if (NMSerialPort.openPromises.has(eventName))
        {
            var promises = NMSerialPort.openPromises.get(eventName);
            promises.push(promise);
            NMSerialPort.openPromises.set(eventName, promises);
        }
        else
        {
            NMSerialPort.openPromises.set(eventName, [promise]);
        }        
    },

    sendMessage: function(message)
    {
        window.postMessage({ type: "togws", message: message }, "*");
    },

    handleSerialPortsEvent: function(message)
    {
        var promises = NMSerialPort.openPromises.get(message.event);
        if (promises)
        {
            for (var i = 0; i < promises.length; i++)
            {
                if (promises[i].filters)
                {
                    promises[i].resolve(SerialPort.filterPorts(message.data, promises[i].filters));
                }
                else
                {
                    promises[i].resolve(message.data);
                }
            }
            NMSerialPort.openPromises.delete(message.event);
        }
    },

    handleSerialPortOpened: function(message)
    {
        var promises = NMSerialPort.openPromises.get(message.event);
        if (promises)
        {
            for (var i = 0; i < promises.length; i++)
            {
                if (promises[i].devicePath == message.devicePath)
                {
                    promises[i].object.id = message.id;
                    NMSerialPort.openObjects.push(promises[i].object);

                    promises[i].resolve(message.data);
                }
            }
            NMSerialPort.openPromises.delete(message.event);
        }        
    },

    handleData: function(message)
    {
        // Decode data into typed array
        var decodedString = atob(message.data);
        var uint8Array = new Uint8Array(decodedString.length);
        for (var i = 0; i < decodedString.length; i++)
        {
            uint8Array[i] = decodedString.charCodeAt(i);
        }

        // Find and call the relevant callback
        for (i = 0; i < NMSerialPort.openObjects.length; i++)
        {
            if (NMSerialPort.openObjects[i].id == message.id)
            {
                NMSerialPort.openObjects[i].callback(uint8Array);
                break;
            }
        }
    },

    handleSerialPortClosed: function(message)
    {
        // Find the relevant object and change its state
        for (var i = 0; i < NMSerialPort.openObjects.length; i++)
        {
            if (NMSerialPort.openObjects[i].id == message.id)
            {
                NMSerialPort.openObjects[i].id = -1;
                if (NMSerialPort.openObjects[i].onCloseCallback)
                {
                    NMSerialPort.openObjects[i].onCloseCallback();
                }
                NMSerialPort.openObjects.splice(i, 1);
                break;
            }
        }        
    },

    onWindowEvent: function(event)
    {

        // Communication with the content script

        // We only accept messages from this window with type set to fromgws
        if (event.source != window || event.data.type != "fromgws")
            return;
        var message = event.data.message;
        if (message.event)
        {
            switch (message.event)
            {
                case "SerialPorts":
                NMSerialPort.handleSerialPortsEvent(message);
                break;

                case "PortOpen":
                NMSerialPort.handleSerialPortOpened(message);
                break;

                case "data":
                NMSerialPort.handleData(message);
                break;

                case "PortClosed":
                NMSerialPort.handleSerialPortClosed(message);
                break;
            }

        }
    },

    openObjects: [] // open serial port objects
};

window.addEventListener("message", NMSerialPort.onWindowEvent);

class SerialPort {
    constructor(devicePath, modeOptions) {
        console.log("Creating a serial connection to ", devicePath);
        this.devicePath = devicePath;
        this.modeString = "";
        this.id = -1;
        if(modeOptions) {
            for(var key in modeOptions) {
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
        var result = [];

        portList.forEach( function(port) {
            var idx, filter;
            for(idx = 0; idx < filters.length; idx++) {
                filter = filters[idx];
                for(var key in filter) {
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
            var uint8Array = new Uint8Array(data);
            var string = "";
            for (var i = 0; i < uint8Array.length; i++)
            {
                string += String.fromCharCode(uint8Array[i]);
            }

            NMSerialPort.sendMessage({command: "write", id: this.id, data: btoa(string)})
        }
    }
}
