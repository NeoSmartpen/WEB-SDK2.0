import { PageInfo } from "../Util/type";
import { initializeApp } from "firebase/app";
import * as NLog from "../Util/NLog";

import { getStorage, ref, getDownloadURL } from "firebase/storage";
import JSZip from "jszip";
import PUIController from "./PUIController";

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGEBUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID,
};

// Ncode Formula
const NCODE_SIZE_IN_INCH = (8 * 7) / 600;
const POINT_72DPI_SIZE_IN_INCH = 1 / 72;

const point72ToNcode = (p: number) => {
  const ratio = NCODE_SIZE_IN_INCH / POINT_72DPI_SIZE_IN_INCH;
  return p / ratio;
};

/**
 * Set Note Page PUI in PUIController
 */
const setNprojInPuiController = async (url: string | null, pageInfo: PageInfo) => {
  let nprojUrl = url;
  if (!nprojUrl) {
    try {
      const sobStr = `${pageInfo.section}_${pageInfo.owner}_${pageInfo.book}.nproj`;
    
      const fbApp = initializeApp(firebaseConfig);
      const storage = getStorage(fbApp);
    
      nprojUrl = await getDownloadURL(ref(storage, `nproj/${sobStr}`));
    } catch (err) {
      NLog.log(err);
      throw err;
    }
  }
  NLog.log("[NoteServer] In the PUIController, set nporj at the following url => " + nprojUrl);
  PUIController.getInstance().fetchOnlyPageSymbols(nprojUrl, pageInfo);
};

/**
 * Calculate page margin info
 * -> define X(min/max), Y(min,max)
 */
const extractMarginInfo = async (url: string | null, pageInfo: PageInfo) => {
  const sobStr = `${pageInfo.section}_${pageInfo.owner}_${pageInfo.book}.nproj`;
  const page = pageInfo.page;
  
  let nprojUrl = url;
  if (!nprojUrl) {
    try {
      const fbApp = initializeApp(firebaseConfig);
      const storage = getStorage(fbApp);
    
      nprojUrl = await getDownloadURL(ref(storage, `nproj/${sobStr}`));
    } catch (err) {
      NLog.log(err);
      throw err;
    }
  }
  NLog.log("[NoteServer] Get the page margin from the following url => " + nprojUrl);

  try {
    const res = await fetch(nprojUrl);
    const nprojXml = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(nprojXml, "text/xml");

    const section = doc.children[0].getElementsByTagName("section")[0]?.innerHTML;
    const owner = doc.children[0].getElementsByTagName("owner")[0]?.innerHTML;
    const book = doc.children[0].getElementsByTagName("code")[0]?.innerHTML;

    let startPage = doc.children[0].getElementsByTagName("start_page")[0]?.innerHTML;
    const segment_info = doc.children[0].getElementsByTagName("segment_info")
    if (segment_info) {
      const start_page_new = segment_info[0].getAttribute("ncode_start_page");
      startPage = start_page_new;
    }

    const page_item = doc.children[0].getElementsByTagName("page_item")[page - parseInt(startPage)];

    if (page_item === undefined) {
      throw new Error("Page item is undefined");
    }

    NLog.log(`Target SOBP: ${section}(section) ${owner}(owner) ${book}(book) ${page}(page)`);

    let x1, x2, y1, y2, crop_margin, l, t, r, b;

    x1 = parseInt(page_item.getAttribute("x1"));
    x2 = parseInt(page_item.getAttribute("x2"));
    y1 = parseInt(page_item.getAttribute("y1"));
    y2 = parseInt(page_item.getAttribute("y2"));

    crop_margin = page_item.getAttribute("crop_margin");
    const margins = crop_margin.split(",");
    l = parseFloat(margins[0]);
    t = parseFloat(margins[1]);
    r = parseFloat(margins[2]);
    b = parseFloat(margins[3]);

    const Xmin = point72ToNcode(x1) + point72ToNcode(l);
    const Ymin = point72ToNcode(y1) + point72ToNcode(t);
    const Xmax = point72ToNcode(x2) - point72ToNcode(r);
    const Ymax = point72ToNcode(y2) - point72ToNcode(b);

    return { Xmin, Xmax, Ymin, Ymax };
  } catch (err) {
    NLog.log(err);
    throw err;
  }
};


/**
 * GET note image function
 */
const getNoteImage = async (pageInfo: PageInfo, setImageBlobUrl: any) => {
  const sobStr = `/${pageInfo.section}_${pageInfo.owner}_${pageInfo.book}.zip`;
  const page = pageInfo.page;

  const fbApp = initializeApp(firebaseConfig);
  const storage = getStorage(fbApp);

  const jszip = new JSZip();
  await getDownloadURL(ref(storage, `png/${sobStr}`)).then(async (url) => {
    const zipBlob = await fetch(url).then((res) => res.blob());
    await jszip.loadAsync(zipBlob).then(async function (zip) {
      const zipValues: any = await Object.values(zip.files);
      const target = zipValues.filter((x: any) => {
        let found = x.name.match(/(\d+)_(\d+)_(\d+)_(\d+)\.jpg/);
        let pageNum = found[4] * 1;
        if (pageNum === page) {
          return true;
        } else {
          return false;
        }
      });

      await target[0].async("blob").then(async function (imageBlob: any) {
        const imageBlobUrl = await URL.createObjectURL(imageBlob);
        setImageBlobUrl(imageBlobUrl);
      });
    });
  });
};

const api = {
  extractMarginInfo,
  getNoteImage,
  setNprojInPuiController,
};

export default api;
