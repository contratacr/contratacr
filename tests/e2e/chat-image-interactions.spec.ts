import { test, expect } from "playwright/test";
import { messageMenuTop, dismissImageSwipe } from "../../src/lib/direct-chat/image-interactions";

test("photo menu stays eight pixels from the bubble with its actual option height", () => {
 const box = {top:600,bottom:900};
 for(const height of [96,144,192]) {
  const top = messageMenuTop(box,height,1000);
  expect(box.top - (top + height)).toBe(8);
 }
 expect(messageMenuTop({top:100,bottom:200},144,1000)).toBe(208);
 expect(messageMenuTop({top:0,bottom:900},192,700)).toBe(12);
});
test("vertical swipes close in either direction; zoom, taps and horizontal pans do not", () => {
 expect(dismissImageSwipe(12,100)).toBe(true);
 expect(dismissImageSwipe(-12,-100)).toBe(true);
 for(const [dx,dy,scale] of [[0,20,1],[100,90,1],[0,120,2],[0,0,1]])
  expect(dismissImageSwipe(dx,dy,scale)).toBe(false);
});
