import $ from "jquery";
import { PageInfo, Paper } from "../Util/type";
// import GenericPuiNproj from "./nproj/note_3_1013_1.json";
// import GridaPuiNproj from "./nproj/3_1013_1116_Grida.json";
// import PaperTubePuiNproj from "./nproj/papertube_controller_171117.json";
// import SmartClassKitPuiProj from "./nproj/SmartClassKit_Controller.json";
import GenericPuiNproj from "./nproj/note_3_1013_1.nproj";
import GridaPuiNproj from "./nproj/3_1013_1116_Grida.nproj";
import PaperTubePuiNproj from "./nproj/papertube_controller_171117.nproj";
import SmartClassKitPuiProj from "./nproj/SmartClassKit_Controller.nproj";
import { symbolBox } from "./symbolBox";

const PU_TO_NU = 0.148809523809524;

const predefinedPuiGroup = [GenericPuiNproj, GridaPuiNproj, PaperTubePuiNproj, SmartClassKitPuiProj];

let _puiInstance: PUIController = null;

export type PuiSymbolType = {
  sobp: PageInfo;
  command: string;

  type: "Rectangle" | "Ellipse" | "Polygon" | "Custom"; // string,
  rect_nu?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  ellipse_nu?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  custom_nu?: {
    left: number;
    top: number;
    width: number;
    height: number;
    lock: boolean;
  };
  polygon?: { x: number; y: number }[];
  extra?: string;
};

type NprojPageJson = {
  sobp: PageInfo;
  crop_margin: { left: number; top: number; right: number; bottom: number };
  size_pu: { width: number; height: number };
  nu: { Xmin: number; Ymin: number; Xmax: number; Ymax: number };
  whole: { x1: number; y1: number; x2: number; y2: number };
};

type NprojJson = {
  book: {
    title: string;
    author: string;
    section: number;
    owner: number;
    book: number;
    start_page: number;
    extra_info: {
      [key: string]: string;
    };
  };

  pdf: {
    filename: string;
    numPages: number;
  };

  pages: NprojPageJson[];

  symbols: PuiSymbolType[];

  resources: { [id: string]: string };
};

export function isPUI(pageInfo: PageInfo): boolean {
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
}

export function isPUIOnPage(sobp: Paper, x: number, y: number): boolean {
  const pageInfo = { section: sobp.section, owner: sobp.owner, book: sobp.note, page: sobp.page };

  const sobpStr = makeNPageIdStr(pageInfo);
  const pc = PUIController.getInstance();
  const isInclude = Object.keys(pc._onlyPageSymbols).includes(sobpStr);

  if (isInclude) {
    const sobp = {
      section: pageInfo.section,
      owner: pageInfo.owner,
      note: pageInfo.book,
      page: pageInfo.page,
    };
    const point_nu = {
      x,
      y,
    };
    return pc.checkPuiCommand(sobp, point_nu);
  }
  return false;
}

function makeNPageIdStr(pageInfo: PageInfo, separator = ".") {
  if (pageInfo) {
    const { section, owner, book, page } = pageInfo;

    if (page !== undefined) return `${section}${separator}${owner}${separator}${book}${separator}${page}`;

    if (book !== undefined) return `${section}${separator}${owner}${separator}${book}`;

    if (owner !== undefined) return `${section}${separator}${owner}`;

    if (section !== undefined) return `${section}`;

    return `${section}${separator}${owner}${separator}${book}${separator}${page}`;
  }
  return `${pageInfo}`;
}

function insidePolygon(point: { x: number; y: number }, vs: { x: number; y: number }[]) {
  // ray-casting algorithm based on
  // https://wrf.ecse.rpi.edu/Research/Short_Notes/pnpoly.html/pnpoly.html

  const { x, y } = point;

  let inside = false;
  for (let i = 0, j = vs.length - 1, l = vs.length; i < l; j = i++) {
    const { x: xi, y: yi } = vs[i];
    const { x: xj, y: yj } = vs[j];

    const intersect = yi > y != yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

function insideRectangle(
  point: { x: number; y: number },
  rc: { left: number; top: number; width: number; height: number }
) {
  return point.x >= rc.left && point.x <= rc.left + rc.width && point.y >= rc.top && point.y <= rc.top + rc.height;
}

function insideEllipse(point: { x: number; y: number }, el: { x: number; y: number; width: number; height: number }) {
  const p = Math.pow(point.x - el.x, 2) / Math.pow(el.width, 2) + Math.pow(point.y - el.y, 2) / Math.pow(el.height, 2);
  return p <= 1;
}

export default class PUIController {
  private _pageSymbols: { [sobp_str: string]: PuiSymbolType[] } = {};

  public _onlyPageSymbols: { [sobp_str: string]: PuiSymbolType[] } = {};
  private _onlyPageResources: { [id: string]: string } = {};
  private _onlyPageSymbolFlag: boolean = false;

  private _ready: Promise<void>;

  constructor() {
    // this._ready = this.readPredefinedSymbolsByJSON();
    this._ready = this.readPredefinedSymbolsByXML();
  }

  static getInstance() {
    if (!_puiInstance) {
      _puiInstance = new PUIController();
    }

    return _puiInstance;
  }

  /**
   * Parses and stores nproj data for predefined products with fixed SOBP (e.g., Plate).
   */
  private readPredefinedSymbolsByXML = async () => {
    for (const url of predefinedPuiGroup) {
      // nproj 파일에서 symbol을 받는다.
      const { symbols } = await this.getPuiXML(url);

      // 해당 페이지에 symbol을 넣고,
      for (const s of symbols) {
        const idStr = makeNPageIdStr(s.sobp);
        if (!this._pageSymbols[idStr]) this._pageSymbols[idStr] = [];
        this._pageSymbols[idStr].push(s);

        // if (!commands.includes(s.command)) commands.push(s.command);
      }
    }
  };
  // private readPredefinedSymbolsByJSON = async () => {
  //   for (const json of predefinedPuiGroup) {
  //     const symbols = await this.getPuiJSON(json);

  //     for (const s of symbols) {
  //       const idStr = makeNPageIdStr(s.sobp);
  //       if (!this._pageSymbols[idStr]) this._pageSymbols[idStr] = [];
  //       this._pageSymbols[idStr].push(s);
  //     }
  //   }
  // };

  /**
   * Parses and stores nproj data for products that must be stored and fetched from a server (e.g., many-note products).
   * @param url URL of the nproj file
   * @param page a specific page number of the note
   */
  private readPageSymbols = async (url: string, page: number) => {
    const { symbols, resources } = await this.getPuiXML(url);

    this._onlyPageSymbols = {};

    for (let j = 0, l2 = symbols.length; j < l2; j++) {
      const s = symbols[j];
      if (s.sobp.page === page) {
        const idStr = makeNPageIdStr(s.sobp);
        if (!this._onlyPageSymbols[idStr]) this._onlyPageSymbols[idStr] = [];
        this._onlyPageSymbols[idStr].push(s);
      }
    }

    if (Object.keys(resources).length) {
      this._onlyPageResources = resources;
    }
  };

  public fetchOnlyPageSymbols = async (url: string, sobp: PageInfo) => {
    const key = Object.keys(this._onlyPageSymbols)[0];
    const sobpStr = makeNPageIdStr(sobp);

    if (key !== sobpStr) {
      this.readPageSymbols(url, sobp.page);
    }
  };

  private isValidResourceIdFormat = (id: string) => {
    const regexUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const regexBrackets = /^\{.*\}$/;

    // '{9e3b1b11-1b1e-42be-8684-40679918ebc9}' ==> true
    // '9e3b1b11-1b1e-42be-8684-40679918ebc9' ==> true
    // '{any string}' ==> true

    return regexBrackets.test(id) || regexUUID.test(id);
  };

  public checkPuiCommand = (sobp: Paper, point_nu: { x: number; y: number }) => {
    this._onlyPageSymbolFlag = true;
    const command = this.getPuiCommand_sync(sobp, point_nu);
    if (command && !/^qv/i.test(command)) {
      //qv로 시작하는 커맨드(퀵뷰)는 pui로 취급하지 않음
      return true;
    }
    this._onlyPageSymbolFlag = false;
    return false;
  };

  public getPuiCommand = async (sobp: Paper, x: number, y: number) => {
    await this._ready;
    const command = this.getPuiCommand_sync(sobp, { x: x, y: y });
    if (command) {
      this._onlyPageSymbolFlag = false;

      if (this.isValidResourceIdFormat(command)) {
        // Resource(음원 등) 를 이용하는 PUI commnad 일 시 resourcePath를 반환
        const resourcePath = this._onlyPageResources[command];
        return resourcePath;
      } else {
        return command;
      }
    }
  };

  private getPuiCommand_sync = (sobp: Paper, point_nu: { x: number; y: number }) => {
    const pageInfo = { section: sobp.section, owner: sobp.owner, book: sobp.note, page: sobp.page };

    let symbols: { [sobp_str: string]: PuiSymbolType[] };
    if (this._onlyPageSymbolFlag) {
      symbols = this._onlyPageSymbols;
    } else {
      symbols = this._pageSymbols;
    }

    const pageSymbols = symbols[makeNPageIdStr(pageInfo)];
    if (!pageSymbols) return undefined;

    for (const s of pageSymbols) {
      switch (s.type) {
        case "Rectangle": {
          if (insideRectangle(point_nu, s.rect_nu)) return s.command;
          break;
        }

        case "Ellipse": {
          if (insideEllipse(point_nu, s.ellipse_nu)) return s.command;
          break;
        }

        case "Polygon": {
          if (insidePolygon(point_nu, s.polygon)) {
            return s.command;
          }

          break;
        }
      }
    }

    return undefined;
  };

  get ready() {
    return this._ready;
  }

  private getPuiXML = async (url: string) => {
    const res = await fetch(url);
    const nprojXml = await res.text();
    // console.log(nprojXml);

    // book 정보
    const $bookXml = $(nprojXml).find("book");
    const title = $bookXml.find("title").text();
    const author = $bookXml.find("author").text();

    const section = parseInt($bookXml.find("section").text(), 10);
    const owner = parseInt($bookXml.find("owner").text(), 10);
    const book = parseInt($bookXml.find("code").text(), 10);
    let startPage = parseInt($bookXml.find("start_page").text(), 10);

    const segment_info = $bookXml.find("segment_info");
    const ncode_start_page_str = segment_info.attr("ncode_start_page");
    if (ncode_start_page_str) {
      const start_page_new = parseInt(ncode_start_page_str, 10);
      startPage = start_page_new;
    }
    const extra = $bookXml.find("extra_info")?.text();
    let extra_info = undefined as { [key: string]: string };
    if (extra_info) {
      const arr = extra.split("=");
      extra_info = {};
      extra_info[arr[0]] = arr[1];
    }

    const $pdfXml = $(nprojXml).find("pdf");
    const filename = $pdfXml.find("path").text();

    // page 정보
    const $pages = $(nprojXml).find("pages");
    const numPages = parseInt($pages.attr("count") || "", 10);

    const ret: NprojJson = {
      book: {
        title,
        author,
        section,
        owner,
        book,
        start_page: startPage,
        extra_info,
      },

      pdf: {
        filename,
        numPages,
      },

      pages: new Array(numPages),

      symbols: [],

      resources: {},
    };

    // page item에 대한 처리
    const $page_items = $pages.find("page_item");
    $page_items.each((index: number, page) => {
      const p = $(page);
      const pageDelta = parseInt(p.attr("number") || "index", 10);
      const sobp = { section, owner, book, page: startPage + pageDelta };

      const surface_pu = {
        left: parseFloat(p.attr("x1") || "0"),
        top: parseFloat(p.attr("y1") || "0"),
        right: parseFloat(p.attr("x2") || "0"),
        bottom: parseFloat(p.attr("y2") || "0"),
      };

      const $crop_margin = p.attr("crop_margin") || "0,0,0,0";
      const margins = $crop_margin.split(",");
      const crop_margin_pu = {
        left: parseFloat(margins[0]),
        top: parseFloat(margins[1]),
        right: parseFloat(margins[2]),
        bottom: parseFloat(margins[3]),
      };

      const size_pu = {
        width: Math.round(surface_pu.right - crop_margin_pu.right) - (surface_pu.left + crop_margin_pu.left),
        height: Math.round(surface_pu.bottom - crop_margin_pu.bottom) - (surface_pu.top + crop_margin_pu.top),
      };

      const nu = {
        Xmin: (surface_pu.left + crop_margin_pu.left) * PU_TO_NU,
        Ymin: (surface_pu.top + crop_margin_pu.top) * PU_TO_NU,
        Xmax: (surface_pu.left + size_pu.width) * PU_TO_NU,
        Ymax: (surface_pu.top + size_pu.height) * PU_TO_NU,
      };
      // const Xmax_physical = (surface_pu.right - padding_pu.right) * PU_TO_NU;
      // const Ymax_physical = (surface_pu.bottom - padding_pu.bottom) * PU_TO_NU;

      // 결과를 push
      const item: NprojPageJson = {
        sobp,
        size_pu,
        nu,
        whole: { x1: surface_pu.left, x2: surface_pu.right, y1: surface_pu.top, y2: surface_pu.bottom },
        crop_margin: crop_margin_pu,
      };

      ret.pages[pageDelta] = item;
    });

    // symbol 정보
    const $symbols = $(nprojXml).find("symbols");
    const symbolXml = $symbols.find("symbol");

    $(symbolXml).each(function (index, sym) {
      // console.log(sym.outerHTML);

      const pageDelta = parseInt($(sym).attr("page") || "0", 10);
      const page = pageDelta + startPage;
      const sobp = { section, owner, book, page };

      const type: string = $(sym).attr("type") || ""; // 여기서는 Rectangle만 취급한다.
      const x = parseFloat($(sym).attr("x") || "");
      const y = parseFloat($(sym).attr("y") || "");
      const width = parseFloat($(sym).attr("width") || "");
      const height = parseFloat($(sym).attr("height") || "");

      const lock = parseInt($(sym).attr("lock") || "");

      const command: string = $(sym).find("command").attr("param");

      const extra = $(sym).find("extra").attr("param") || "";

      switch (type) {
        case "Rectangle": {
          const puiSymbol: PuiSymbolType = {
            type,
            command,
            sobp,
            rect_nu: {
              left: x * PU_TO_NU,
              top: y * PU_TO_NU,
              width: width * PU_TO_NU,
              height: height * PU_TO_NU,
            },
            extra,
          };
          ret.symbols.push(puiSymbol);
          break;
        }

        case "Ellipse": {
          const puiSymbol: PuiSymbolType = {
            type,
            command,
            sobp,
            ellipse_nu: {
              x: x * PU_TO_NU,
              y: y * PU_TO_NU,
              width: width * PU_TO_NU,
              height: height * PU_TO_NU,
            },
            extra,
          };
          ret.symbols.push(puiSymbol);
          break;
        }

        case "Custom": {
          const puiSymbol: PuiSymbolType = {
            type,
            command,
            sobp,
            custom_nu: {
              left: x * PU_TO_NU,
              top: y * PU_TO_NU,
              width: width * PU_TO_NU,
              height: height * PU_TO_NU,
              lock: lock === 1,
            },
            extra,
          };
          ret.symbols.push(puiSymbol);
          break;
        }

        default: {
          throw new Error(`symbol type(${type} is not "Rectangle" nor "Ellipse"`);
        }
      }
    });

    const $resources = $(nprojXml).find("resources");
    const resourceXml = $resources.find("resource");
    $(resourceXml).each((index, res) => {
      const id = $(res).find("id").text();
      const path = $(res).find("path").text();
      if (id && path) {
        ret.resources[id] = path;
      }
    });

    return ret;
  };

  private getPuiJSON = async (json: PuiJSON) => {
    const symbols: PuiSymbolType[] = [];

    const nprojJson = json.nproj;

    // book 정보
    const bookJson = nprojJson.book;
    const section = parseInt(bookJson[0].section.toString());
    const owner = parseInt(bookJson[0].owner.toString());
    const book = parseInt(bookJson[0].code.toString());
    const startPage = parseInt(bookJson[0].start_page[0]._);

    // page 정보
    const pageJson = nprojJson.pages;
    const numPages = parseInt(pageJson[0].$.count);

    // symbol 정보
    const symbolsJson = nprojJson.symbols;
    const symbolJson = symbolsJson[0].symbol;

    symbolJson.forEach(function (sym) {
      // console.log(sym.outerHTML);

      const pageDelta = parseInt(sym.$.page);
      const type: string = sym.$.type; // 여기서는 Rectangle만 취급한다.
      const x = parseFloat(sym.$.x);
      const y = parseFloat(sym.$.y);
      const width = parseFloat(sym.$.width);
      const height = parseFloat(sym.$.height);

      const command: string = sym.command[0].$.param;

      const page = pageDelta + startPage;
      const sobp = { section, owner, book, page };

      switch (type) {
        case "Rectangle": {
          const puiSymbol: PuiSymbolType = {
            type,
            command,
            sobp,
            rect_nu: {
              left: x * PU_TO_NU,
              top: y * PU_TO_NU,
              width: width * PU_TO_NU,
              height: height * PU_TO_NU,
            },
          };
          symbols.push(puiSymbol);
          break;
        }

        case "Ellipse": {
          const puiSymbol: PuiSymbolType = {
            type,
            command,
            sobp,
            ellipse_nu: {
              x: x * PU_TO_NU,
              y: y * PU_TO_NU,
              width: width * PU_TO_NU,
              height: height * PU_TO_NU,
            },
          };
          symbols.push(puiSymbol);
          break;
        }

        default: {
          throw new Error(`symbol type(${type} is not "Rectangle" nor "Ellipse"`);
        }
      }
    });

    return symbols;
  };
}
