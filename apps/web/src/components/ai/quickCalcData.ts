import React from 'react';

export interface CalcResult {
  title: string;
  items: { label: string; value: string }[];
  tip?: string;
}

export const inputStyle: React.CSSProperties = {
  padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border)',
  background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13,
  outline: 'none', width: '100%',
};

export const CROP_DATA: Record<string, {
  name: string;
  seedPerTray: number;  // grams per standard tray
  yieldPerTray: number; // grams harvest per tray
  darkDays: number;     // days under weight/dome
  lightDays: number;    // days under light
  totalDays: number;    // total grow cycle
  weightKg: number;     // press weight in kg
}> = {
  rukkola:     { name: 'Rukkola',         seedPerTray: 5,  yieldPerTray: 30,  darkDays: 2, lightDays: 5,  totalDays: 7,  weightKg: 2 },
  rediska:     { name: 'Rediska',         seedPerTray: 12, yieldPerTray: 80,  darkDays: 2, lightDays: 4,  totalDays: 6,  weightKg: 3 },
  kungaboqar:  { name: 'Kungaboqar',      seedPerTray: 25, yieldPerTray: 120, darkDays: 3, lightDays: 4,  totalDays: 7,  weightKg: 5 },
  nohat:       { name: "No'xat",          seedPerTray: 30, yieldPerTray: 100, darkDays: 2, lightDays: 3,  totalDays: 5,  weightKg: 3 },
  brokkoli:    { name: 'Brokkoli',        seedPerTray: 4,  yieldPerTray: 25,  darkDays: 2, lightDays: 5,  totalDays: 7,  weightKg: 2 },
  gorchitsa:   { name: "Gorchitsa (xantal)", seedPerTray: 5,  yieldPerTray: 35,  darkDays: 2, lightDays: 4,  totalDays: 6,  weightKg: 2 },
  mosh:        { name: 'Mosh (mung)',     seedPerTray: 25, yieldPerTray: 90,  darkDays: 2, lightDays: 3,  totalDays: 5,  weightKg: 3 },
  bazilika:    { name: 'Bazilika',        seedPerTray: 3,  yieldPerTray: 20,  darkDays: 3, lightDays: 7,  totalDays: 10, weightKg: 1.5 },
};
