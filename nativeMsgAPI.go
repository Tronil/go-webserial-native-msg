package main

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	serial "go.bug.st/serial"
	"os"
)

// Commands "enum"
const (
	CommandClose uint8 = iota
)

var openPorts map[uint8]OpenSerialPort
var portClosed chan uint8
var stdoutChannel chan []byte

// Message types
type OpenSerialPort struct {
	commandChannel     chan uint8
	writeSerialChannel chan []byte
}

type PortListEvent struct {
	Event string       `json:"event"`
	Data  []SerialPort `json:"data"`
}

type SerialDataEvent struct {
	Event string `json:"event"`
	Id    uint8  `json:"id"`
	Data  []byte `json:"data"`
}

type PortOpenEvent struct {
	Event      string `json:"event"`
	Id         uint8  `json:"id"`
	DevicePath string `json:"devicePath"`
}

type PortClosedEvent struct {
	Event string `json:"event"`
	Id    uint8  `json:"id"`
}

type ErrorEvent struct {
	Event        string `json:"event"`
	InResponseTo string `json:"inResponseTo"`
	Id           int16  `json:"id"`
	Error        string `json:"error"`
}

func writeNMToStdout(json string) {
	size := make([]byte, 4)
	binary.LittleEndian.PutUint32(size, uint32(len(json)))

	os.Stdout.Write(size)
	fmt.Print(json)
}

func outputNativeDebugMessage(message string) {
	json := fmt.Sprintf("{\"debug\": \"%s\"}", message)
	writeNMToStdout(json)
}

func outputErrorMessage(inResponseTo []byte, id int16, error string) {
	event := ErrorEvent{Event: "Error", InResponseTo: string(inResponseTo[:]), Id: id, Error: error}
	js, err := json.Marshal(event)
	if err != nil {
		//http.Error(w, err.Error(), http.StatusInternalServerError)
		outputNativeDebugMessage("Internal error")
		return
	}

	writeNMToStdout(string(js[:]))
}

func sendJsonEventNative(daEvent interface{}) {
	js, err := json.Marshal(daEvent)
	if err != nil {
		//http.Error(w, err.Error(), http.StatusInternalServerError)
		outputNativeDebugMessage("Internal error")
		return
	}

	msg := make([]byte, 4)
	binary.LittleEndian.PutUint32(msg, uint32(len(js)))
	msg = append(msg, js...)

	stdoutChannel <- msg
}

func sendDebugMessage(message string) {
	js := fmt.Sprintf("{\"debug\": \"%s\"}", message)
	msg := make([]byte, 4)
	binary.LittleEndian.PutUint32(msg, uint32(len(js)))
	msg = append(msg, js...)
	stdoutChannel <- msg
}

func listCommPorts() {
	reply := PortListEvent{Event: "SerialPorts"}

	ports, _ := GetSerialPortList()

	for _, port := range ports {
		reply.Data = append(reply.Data, port)
	}

	sendJsonEventNative(reply)
}

func connectSerialPort(devicePath string, baudRate int) (bool, string) {
	// TODO: Handle potential panics better
	defer func() {
		if r := recover(); r != nil {
		}
	}()

	if baudRate < 1 {
		baudRate = 9600 // Default to 9600
	}

	outputNativeDebugMessage(fmt.Sprintf("Requesting Serial connection to %v (baudrate:%d)", devicePath, baudRate))

	if len(devicePath) == 0 {
		return false, "Invalid devicePath"
	}

	mode := &serial.Mode{
		BaudRate: baudRate,
		Parity:   serial.PARITY_NONE,
		DataBits: 8,
		StopBits: serial.STOPBITS_ONE,
	}

	port, err := serial.OpenPort(devicePath, mode)
	if err != nil {
		//http.Error(w, err.Error(), http.StatusInternalServerError)
		return false, "Could not open serial port"
	}

	// Find unused id
	id := uint8(0)
	for {
		idAvailable := true
		for key := range openPorts {
			if key == id {
				idAvailable = false
				break
			}
		}
		if idAvailable {
			break
		} else {
			id++
		}
	}

	outputNativeDebugMessage(fmt.Sprintf("Using id %v", id))

	openPorts[id] = OpenSerialPort{make(chan uint8), make(chan []byte, 5)}

	// Serial I/O routine
	go func() {

		readCommandChannel := make(chan uint8, 1)
		writeCommandChannel := make(chan uint8, 1)

		readDone := make(chan bool)
		writeDone := make(chan bool)

		// Read routine
		go func() {
			for {
				buff := make([]byte, 2048) // 512 bytes is max for high speed USB (so this leaves space for minimum 4 packages)
				n, err := port.Read(buff)
				if err != nil {
					sendJsonEventNative(ErrorEvent{Event: "Error", InResponseTo: "", Id: int16(id), Error: "Error reading from serial port"})
					openPorts[id].commandChannel <- CommandClose
					readDone <- true
					break
				}
				if n == 0 {
					sendJsonEventNative(ErrorEvent{Event: "Error", InResponseTo: "", Id: int16(id), Error: "EOF reading from serial port"})
					openPorts[id].commandChannel <- CommandClose
					readDone <- true
					break
				}
				event := SerialDataEvent{Event: "data", Id: id, Data: buff[:n]}
				sendJsonEventNative(event)
				select {
				case command := <-readCommandChannel:
					if command == CommandClose {
						readDone <- true
						break
					}
				default:
					// No command, continue with serial input
				}
			}
		}()

		// Write routine
		go func() {
			for {
				select {
				case message := <-openPorts[id].writeSerialChannel:
					_, err = port.Write(message)
					if err != nil {
						sendJsonEventNative(ErrorEvent{Event: "Error", InResponseTo: "", Id: int16(id), Error: "Error writing to serial port"})
						openPorts[id].commandChannel <- CommandClose
						writeDone <- true
						break
					}
				case command := <-writeCommandChannel:
					if command == CommandClose {
						writeDone <- true
						break
					}
				}
			}
		}()

		for {
			command := <-openPorts[id].commandChannel
			readCommandChannel <- command
			writeCommandChannel <- command
			if command == CommandClose {
				outputNativeDebugMessage("CommandClose received")
				<-readDone
				<-writeDone
				port.Close()
				sendJsonEventNative(PortClosedEvent{Event: "PortClosed", Id: id})
				portClosed <- id
				break
			}
		}
	}()

	sendJsonEventNative(PortOpenEvent{Event: "PortOpen", Id: id, DevicePath: devicePath})

	return true, ""
}

func handleStdinRead(msgBuffer *[]byte, msgLength *int) {
	for {
		if len(*msgBuffer) >= 4 && *msgLength == -1 {
			// First four bytes are the message length
			*msgLength = int(binary.LittleEndian.Uint32((*msgBuffer)[:4]))
			*msgBuffer = (*msgBuffer)[4:]
		}

		if *msgLength != -1 && len(*msgBuffer) >= *msgLength {
			msg := (*msgBuffer)[:*msgLength]
			*msgBuffer = (*msgBuffer)[*msgLength:]
			*msgLength = -1

			// Message received; decode msg
			var jsonMsg interface{}
			err := json.Unmarshal(msg, &jsonMsg)
			if err != nil {
				outputErrorMessage(msg, -1, "Command not valid JSON")
				continue
			}
			command := jsonMsg.(map[string]interface{})

			switch command["command"] {
			case "close":
				id, ok := command["id"].(float64)
				if !ok {
					outputErrorMessage(msg, -1, "Missing id in close command")
					break
				}
				if port, ok := openPorts[uint8(id)]; ok {
					outputNativeDebugMessage(fmt.Sprintf("Closing serial port %v", id))
					port.commandChannel <- CommandClose
				} else {
					outputErrorMessage(msg, int16(id), "No open port with that id")
				}

			case "open":
				devicePath, ok := command["devicePath"].(string)
				if !ok {
					outputErrorMessage(msg, -1, "Missing devicePath!")
					break
				}
				baudRate, ok := command["baudRate"].(float64)
				if !ok {
					outputErrorMessage(msg, -1, "Missing baudRate!")
					break
				}
				outputNativeDebugMessage(fmt.Sprintf("Opening serial port %v", devicePath))
				connected, error := connectSerialPort(devicePath, int(baudRate))
				if !connected {
					outputErrorMessage(msg, -1, error)
				}

			case "listPorts":
				listCommPorts()

			case "write":
				var commandStruct SerialDataEvent
				err := json.Unmarshal(msg, &commandStruct)
				if err != nil {
					outputErrorMessage(msg, -1, "Malformed write command")
					break
				}
				if port, ok := openPorts[commandStruct.Id]; ok {
					port.writeSerialChannel <- commandStruct.Data
				} else {
					outputErrorMessage(msg, int16(commandStruct.Id), "No open port with that id")
				}

			default:
				outputErrorMessage(msg, -1, "Command not recognized")
			}
		} else {
			// No more messages to decode
			break
		}
	}
}

func nativeMsgMainLoop() {
	openPorts = make(map[uint8]OpenSerialPort)
	portClosed = make(chan uint8)

	stdinChannel := make(chan []byte, 5)
	stdoutChannel = make(chan []byte, 100)

	// Set up a channel to read from stdin
	go func() {
		for {
			buf := make([]byte, 1000)
			n, err := os.Stdin.Read(buf)
			if err != nil {
				break
			}
			stdinChannel <- buf[:n]
		}
	}()

	msgLength := -1
	var msgBuffer []byte
	for {
		// Wait for commands on stdin, output on stdout or serial port state change
		select {
		case received := <-stdinChannel:
			msgBuffer = append(msgBuffer, received...)
			handleStdinRead(&msgBuffer, &msgLength)

		case msg := <-stdoutChannel:
			os.Stdout.Write(msg)

		case id := <-portClosed:
			outputNativeDebugMessage(fmt.Sprintf("Serial port closed: %v", id))
			delete(openPorts, id)
		}
	}
}

func main() {
	outputNativeDebugMessage(fmt.Sprintf("The proxy service is serving on stdin/stdout"))
	nativeMsgMainLoop()
}
