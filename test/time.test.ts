import assert from "node:assert/strict";
import { test } from "node:test";
import { dateTable, dayLabel, dowOfLocal, epochToLocal, formatWhen, isLocalIso, localToEpoch, nextDateForDow } from "../src/time.js";

const TZ = "America/Toronto";

test("localToEpoch and epochToLocal round-trip in summer and winter", () => {
  for (const local of ["2026-09-25T18:00", "2026-01-15T07:30", "2026-07-01T00:00", "2026-12-31T23:59"]) {
    assert.equal(epochToLocal(localToEpoch(local, TZ), TZ), local);
  }
  // EDT is UTC-4, EST is UTC-5
  assert.equal(new Date(localToEpoch("2026-09-25T18:00", TZ)).toISOString(), "2026-09-25T22:00:00.000Z");
  assert.equal(new Date(localToEpoch("2026-01-15T18:00", TZ)).toISOString(), "2026-01-15T23:00:00.000Z");
});

test("DST change days give the right instant", () => {
  // Clocks go back on 2026-11-01 (01:00 EDT -> 01:00 EST), forward on 2027-03-14.
  assert.equal(epochToLocal(localToEpoch("2026-11-01T18:00", TZ), TZ), "2026-11-01T18:00");
  assert.equal(new Date(localToEpoch("2026-11-01T18:00", TZ)).toISOString(), "2026-11-01T23:00:00.000Z");
  assert.equal(new Date(localToEpoch("2027-03-14T18:00", TZ)).toISOString(), "2027-03-14T22:00:00.000Z");
});

test("isLocalIso rejects impossible dates", () => {
  assert.equal(isLocalIso("2026-09-25T18:00"), true);
  assert.equal(isLocalIso("2026-02-30T18:00"), false);
  assert.equal(isLocalIso("2026-09-25T25:00"), false);
  assert.equal(isLocalIso("2026-09-25 18:00"), false);
  assert.equal(isLocalIso(null), false);
});

test("weekday helpers agree with the calendar", () => {
  assert.equal(dowOfLocal("2026-09-25T18:00"), 5); // Friday
  assert.equal(dowOfLocal("2026-09-26T09:00"), 6); // Saturday
  const wed = localToEpoch("2026-09-23T12:00", TZ);
  assert.equal(nextDateForDow(wed, TZ, 5), "2026-09-25");
  assert.equal(nextDateForDow(wed, TZ, 3), "2026-09-23"); // today counts
  assert.equal(nextDateForDow(wed, TZ, 1), "2026-09-28");
});

test("formatWhen and dayLabel are timezone-free", () => {
  assert.equal(formatWhen("2026-09-25T18:00"), "Fri, Sep 25 · 6:00 PM");
  assert.equal(formatWhen(null), "No pickup time");
  assert.equal(dayLabel("2026-09-25"), "Friday, September 25");
});

test("dateTable starts today in the kitchen timezone and has the right weekdays", () => {
  // 03:00 UTC on Sep 24 is still Sep 23 in Toronto.
  const t = dateTable(Date.UTC(2026, 8, 24, 3, 0), TZ, 4).split("\n");
  assert.equal(t[0], "today Wednesday September 23 = 2026-09-23");
  assert.equal(t[1], "tomorrow Thursday September 24 = 2026-09-24");
  assert.equal(t[2], "Friday September 25 = 2026-09-25");
  assert.equal(t[3], "Saturday September 26 = 2026-09-26");
});
