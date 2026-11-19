import {Capacitor,registerPlugin} from '@capacitor/core';

/**
 * Round 6D (row 65): DOCUMENTED interface of the native room-scan plugin. NOT implemented natively yet (no change
 * to android/ or ios/ — store builds need Isaac's authorization). When it exists:
 *  · iOS 16+ with LiDAR: Apple RoomPlan (RoomCaptureView / RoomCaptureSession) → CapturedRoom encoded with
 *    JSONEncoder (walls/doors/windows with dimensions + transform), returned as `roomplan-json`.
 *  · Android with ARCore Depth: plane detection + depth hit tests → the same JSON shape (walls as vertical planes).
 * The web side already parses that JSON (parseScanJson) and creates the plan through /api/pro/floor-plans.
 * Plugin name: «ContrataRoomScan». Until it is installed, isPluginAvailable() is false and the button stays hidden.
 */
export interface RoomScanPlugin{
 /** Device capability: RoomPlan needs iOS 16+ and LiDAR; ARCore needs Depth API support. */
 isSupported():Promise<{supported:boolean;technology:'roomplan'|'arcore'|'none'}>;
 /** Opens the native capture UI; resolves when the user finishes (rejects with code «cancelled» if aborted). */
 startScan(options:{unit:'m'|'ft';language:'es'|'en'}):Promise<{format:'roomplan-json';data:string;fileName:string}>;
}
export const ROOM_SCAN_PLUGIN='ContrataRoomScan';
export const RoomScan=registerPlugin<RoomScanPlugin>(ROOM_SCAN_PLUGIN);
export async function nativeRoomScanAvailable(){
 if(!Capacitor.isNativePlatform()||!Capacitor.isPluginAvailable(ROOM_SCAN_PLUGIN))return false;
 try{return (await RoomScan.isSupported()).supported;}catch{return false;}
}
