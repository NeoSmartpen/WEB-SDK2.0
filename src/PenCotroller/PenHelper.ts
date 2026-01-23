import PenController from "./PenController";
import PenMessageType from "../API/PenMessageType";
import { Dot, PageInfo, PageInfo2, View, Options, PaperSize } from "../Util/type";
import * as NLog from "../Util/NLog";
import { SDKversion } from "../Util/SDKVersion";

const serviceUuid = parseInt("0x19F1");
const characteristicUuidNoti = parseInt("0x2BA1");
const characteristicUuidWrite = parseInt("0x2BA0");

const PEN_SERVICE_UUID_128 = "4f99f138-9d53-5bfa-9e50-b147491afe68";
const PEN_CHARACTERISTICS_NOTIFICATION_UUID_128 = "64cd86b1-2256-5aeb-9f04-2caf6c60ae57";
const PEN_CHARACTERISTICS_WRITE_UUID_128 = "8bc8cc7d-88ca-56b0-af9a-9bf514d0d61a";

class PenHelper {
  pens: PenController[];
  connectingQueue: string[];
  dotCallback: any;
  pageCallback: any;
  messageCallback: any;
  d: PageInfo2;
  dotStorage: any;
  mac: string;
  isPlate: boolean;
  plateMode: string;
  writecharacteristic: boolean;

  constructor() {
    this.pens = []; // PenController Array
    this.connectingQueue = []; // device.id array
    this.dotCallback = null; // Dot Event Callback function
    this.pageCallback = null;
    this.messageCallback = null; // Pen Event Callback function
    this.d = { section: 0, owner: 0, note: 0, page: 0 }; // PageInfo
    this.dotStorage = {};
    this.mac = "";
    this.isPlate = false;
    this.plateMode = "";
    this.writecharacteristic = false;
  }

  /**
   * @returns {boolean}
   */
  isConnected = () => {
    return this.writecharacteristic ? true : false;
  };

  isConnectedOrConnecting = (device: BluetoothDevice) => {
    return this.pens.some((pen) => pen.device.id === device.id) || this.connectingQueue.includes(device.id);
  };

  addDeviceToConnectingQueue = (device: BluetoothDevice) => {
    this.connectingQueue.push(device.id);
  };

  removeDeviceFromConnectingQueue = (device: BluetoothDevice) => {
    this.connectingQueue = this.connectingQueue.filter((id) => id !== device.id);
  };

  debugMode = (bool: boolean) => {
    NLog.setDebug(bool);
  };

  /**
   * MARK: Dot Event Callback - pen에서 넘어오는 dot을 처리하기 위한 callback function
   *
   * @param {PenController} controller
   * @param {any} args
   */
  handleDot = (controller: PenController, args: any) => {
    const mac = controller.info.MacAddress;
    this.mac = mac;
    const dot = args;

    const pageInfo = dot.pageInfo;
    this.isPlate = false;
    if (this.isPlatePaper(pageInfo)) {
      // platePage 인지 확인 후 isPlate 값 설정
      this.isPlate = true;
    }
    dot.isPlate = this.isPlate;

    if (dot.DotType === 0) {
      // Down
      if (
        this.d.section !== dot.section ||
        this.d.owner !== dot.owner ||
        this.d.note !== dot.note ||
        this.d.page !== dot.page
      ) {
        if (this.pageCallback) {
          this.pageCallback(dot);
        }
        this.d = dot;
        this.dotCallback = null;
      }
    } else if (dot.DotType === 1) {
      // Move
    } else if (dot.DotType === 2) {
      // Up
    }

    if (this.dotCallback) {
      this.dotCallback(mac, dot);
    } else {
      const id = dot.section + "_" + dot.owner + "_" + dot.note + "_" + dot.page;
      if (this.dotStorage[id]) {
        this.dotStorage[id].push(dot);
      } else {
        this.dotStorage[id] = [];
        this.dotStorage[id].push(dot);
      }
    }
  };

  /**
   * MARK: Pen Event Callback - Pen event 발생시 message를 처리하기 위한 로직
   *
   * @param {any} controller
   * @param {any} type
   * @param {any} args
   */
  handleMessage = (controller: any, type: any, args: any) => {
    const mac = controller.info.MacAddress;

    switch (type) {
      case PenMessageType.PEN_AUTHORIZED:
        NLog.log("PenHelper PEN_AUTHORIZED");
        controller.RequestAvailableNotes();
        break;
      default:
        break;
    }

    if (this.messageCallback) {
      this.messageCallback(mac, type, args);
    }
  };

  /**
   * 펜 연결을 위한 bluetooth device를 scan하는 로직
   *
   * @returns {boolean}
   */
  scanPen = async () => {
    if (await this.notSupportBLE()) return;

    const filters = [{ services: [serviceUuid] }, { services: [PEN_SERVICE_UUID_128] }];
    const options: Options = { filters: undefined };
    options.filters = filters;

    try {
      const device = await navigator.bluetooth.requestDevice(options);
      NLog.log("> Name:             " + device.name);
      NLog.log("> Id:               " + device.id);
      NLog.log("> Connected:        " + device.gatt?.connected);
      NLog.log("> SDKVersion:       " + SDKversion);
      await this.connectDevice(device);
    } catch (err) {
      NLog.log("err", err);
    }
  };

  notSupportBLE = async () => {
    if (!navigator.bluetooth) {
      alert("Bluetooth not support");
      NLog.log("Bluetooth not support");
      return true;
    }

    const isEnableBle = await navigator.bluetooth.getAvailability();
    if (!isEnableBle) {
      alert("Bluetooth not support");
      NLog.log("Bluetooth not support");
      return true;
    }
    return false;
  };

  /**
   * Bluetooth device의 연결을 설정하는 로직
   *
   * @param {BluetoothDevice} device
   * @returns
   */
  connectDevice = async (device: BluetoothDevice) => {
    if (!device) return;

    if (!this.isConnectedOrConnecting(device)) {
      NLog.log("Connect start", device);
      try {
        this.addDeviceToConnectingQueue(device);

        const server = (await device.gatt?.connect()) as BluetoothRemoteGATTServer;
        NLog.log("service", server);
        this.serviceBinding_16(server, device);
        this.serviceBinding_128(server, device);
      } catch (err) {
        NLog.log("err conect", err);
      } finally {
        this.removeDeviceFromConnectingQueue(device);
      }
    } else {
      NLog.log("Already connected or connecting");
    }
  };

  /**
   * Bluetooth 16bit UUID service를 binding 하기 위한 로직
   *
   * @param {BluetoothRemoteGATTServer} server
   * @param {BluetoothDevice} device
   */
  serviceBinding_16 = async (server: BluetoothRemoteGATTServer, device: BluetoothDevice) => {
    try {
      const service_16 = await server.getPrimaryService(serviceUuid);
      NLog.log("service_16", service_16);
      const characteristicNoti = await service_16.getCharacteristic(characteristicUuidNoti);
      const characteristicWrite = await service_16.getCharacteristic(characteristicUuidWrite);
      this.characteristicBinding(characteristicNoti, characteristicWrite, device);
    } catch (err) {
      NLog.log("not support service uuid", err);
    }
  };

  /**
   * Bluetooth 128bit UUID service를 binding 하기 위한 로직
   *
   * @param {BluetoothRemoteGATTService} server
   * @param {BluetoothDevice} device
   */
  serviceBinding_128 = async (server: BluetoothRemoteGATTServer, device: BluetoothDevice) => {
    try {
      const service_128 = await server.getPrimaryService(PEN_SERVICE_UUID_128);
      NLog.log("service_128", service_128);
      const characteristicNoti = await service_128.getCharacteristic(PEN_CHARACTERISTICS_NOTIFICATION_UUID_128);
      const characteristicWrite = await service_128.getCharacteristic(PEN_CHARACTERISTICS_WRITE_UUID_128);
      this.characteristicBinding(characteristicNoti, characteristicWrite, device);
    } catch (err) {
      NLog.log("not support service uuid", err);
    }
  };

  /**
   * Bluetooth의 Characteristics 상태 정보를 binding 하기 위한 로직
   *
   * @param {BluetoothRemoteGATTCharacteristic} read
   * @param {BluetoothRemoteGATTCharacteristic} write
   * @param {BluetoothDevice} device
   */
  characteristicBinding = async (
    read: BluetoothRemoteGATTCharacteristic,
    write: BluetoothRemoteGATTCharacteristic,
    device: BluetoothDevice
  ) => {
    let controller = new PenController();
    controller.device = device;
    // Read Set
    await read.startNotifications();
    read.addEventListener("characteristicvaluechanged", (event: any) => {
      const value = event.target.value;
      let a: any = [];
      for (let i = 0; i < value.byteLength; i++) {
        a.push(value.getUint8(i));
      }
      controller.putData(a);
    });
    controller.OnConnected();

    // Write Set
    controller.addWrite((data) => {
      write
        .writeValue(data as unknown as BufferSource)
        .then(() => {
          NLog.log("write success CMD: ", "0x" + data[1].toString(16), data[1]);
        })
        .catch((err: any) => {
          NLog.log("write Error", err);
          if (err instanceof DOMException) {
            setTimeout(() => {
              write.writeValue(data);
            }, 500);
          }
        });
    });

    // Call back Event Set
    controller.addCallback(this.handleDot, this.handleMessage);
    // device Status Set
    device.addEventListener("gattserverdisconnected", this.onDisconnected.bind(this, controller));

    this.pens.push(controller);
    this.writecharacteristic = true;
  };

  /**
   * Disconnected Callback function
   *
   * @param {PenController} controller
   * @param {any} event
   */
  onDisconnected = (controller: PenController, event: any) => {
    NLog.log("device disconnect", controller, event);
    this.pens = this.pens.filter((p: any) => p !== controller);
    this.writecharacteristic = this.pens.length > 0;
    controller.OnDisconnected();
  };

  /**
   * Disconnect Action
   *
   * @param {PenController} penController
   */
  disconnect = (penController: PenController) => {
    penController.device.gatt.disconnect();
  };

  /**
   * 해당 pageInfo가 Plate paper인지 확인하기 위한 로직
   *
   * @param {PageInfo} pageInfo
   * @returns {boolean}
   */
  isPlatePaper = (pageInfo: PageInfo) => {
    const { owner, book } = pageInfo;
    if (owner === 1013 && book === 2) {
      return true;
    }
    return false;
  };

  /**
   * 해당 pageInfo 가 PUI 인지 확인하기 위한 로직
   * 
   * @param {PageInfo} pageInfo
   * @returns {boolean}
   */
  isPUI = (pageInfo: PageInfo) => {
    const { owner, book, page } = pageInfo;
    if (owner === 27 && book === 161 && page === 1) {
      return true;
    }
  
    if (owner === 1013 && (book === 1 || book === 1116)) {
      // page === 4, Smart plate
      // page === 1, Plate paper
      return true;
    }
  
    return false;
  };

  /**
   * props로 받은 pageInfo들을 바탕으로 같은 page인지 확인하기 위한 로직
   *
   * @param {PageInfo} page1
   * @param {PageInfo} page2
   * @returns {boolean}
   */
  isSamePage = (page1: PageInfo, page2: PageInfo) => {
    if (page1 === undefined && page2 === undefined) return true;
    if (page1 && !page2) return false;
    if (!page1 && page2) return false;

    if (
      page1.page !== page2.page ||
      page1.book !== page2.book ||
      page1.owner !== page2.owner ||
      page1.section !== page2.section
    ) {
      return false;
    }
    return true;
  };

  /**
   * Ncode dot 좌표를 view(Canvas) 크기에 맞춘 좌표값으로 변환하는 로직
   * @param {Dot} dot
   * @param {View} view
   * @param {PaperSize} paperSize
   * @returns {Dot}
   */
  ncodeToScreen = (dot: Dot, view: View, paperSize: PaperSize) => {
    let paperBase, paperWidth, paperHeight;
    paperBase = { Xmin: paperSize.Xmin, Ymin: paperSize.Ymin }; // ncode paper의 margin 값
    paperWidth = paperSize.Xmax - paperSize.Xmin; // ncode paper의 가로길이
    paperHeight = paperSize.Ymax - paperSize.Ymin; // ncode paper의 세로길이

    /**
     * ncode_size : ncode_dot_position = view_size : view_dot_position
     * view_dot_position = (ncode_dot_position * view_size) / ncode_size
     * 따라서, ncode_dot_position에 각각의 width, height ratio를 곱해주면 된다.
     *
     * widthRatio = view.width / paperWidth
     * heightRatio = view.height / paperHeight
     */

    const widthRatio = view.width / paperWidth;
    const heightRatio = view.height / paperHeight;
    // dot의 기본 margin 값인 Xmin, Ymin 값을 빼주도록 한다.
    const x = (dot.x - paperBase.Xmin) * widthRatio;
    const y = (dot.y - paperBase.Ymin) * heightRatio;

    return { x, y };
  };

  /**
   * SmartPlate의 Ncode dot 좌표를 view(Canvas) 크기, angle(각도)에 맞춘 좌표값으로 변환하는 로직
   * @param {Dot} dot
   * @param {View} view
   * @param {number} angle - [0', 180']: landscape, [90', 270']: portrait
   * @param {PaperSize} paperSize
   * @returns {Dot}
   */
  ncodeToScreen_smartPlate = (dot: Dot, view: View, angle: number, paperSize: PaperSize) => {
    let paperBase, paperWidth, paperHeight;
    paperBase = { Xmin: paperSize.Xmin, Ymin: paperSize.Ymin };
    paperWidth = paperSize.Xmax - paperSize.Xmin;
    paperHeight = paperSize.Ymax - paperSize.Ymin;

    let plateMode = "landscape";
    if (angle === 90 || angle === 270) {
      plateMode = "portrait";
    }

    // plateMode 가 portrait 일때는 ncode의 width <-> height swap
    if (plateMode === "portrait") {
      const tmp = paperHeight;
      paperHeight = paperWidth;
      paperWidth = tmp;
    }

    let nx = Math.cos((Math.PI / 180) * angle) * dot.x - Math.sin((Math.PI / 180) * angle) * dot.y;
    let ny = Math.sin((Math.PI / 180) * angle) * dot.x + Math.cos((Math.PI / 180) * angle) * dot.y;

    if (angle === 0) {
      paperBase.Xmin = 0;
      paperBase.Ymin = 0;
    } else if (angle === 90) {
      paperBase.Ymin = 0;
      nx += paperSize.Ymax;
    } else if (angle === 180) {
      nx += paperSize.Xmax;
      ny += paperSize.Ymax;
    } else if (angle === 270) {
      paperBase.Xmin = 0;
      ny += paperSize.Xmax;
    }

    const widthRatio = view.width / paperWidth;
    const heightRatio = view.height / paperHeight;
    const x = (nx - paperBase.Xmin) * widthRatio;
    const y = (ny - paperBase.Ymin) * heightRatio;

    return { x, y };
  };
}

const shared = new PenHelper();
export default shared;
