import { EventId } from '@/types/game';

export interface EventDef {
  id: EventId;
  name: string;
  announcement: string;
  endAnnouncement: string;
  skyTint: string;
  isTimed: boolean; // blood moon / solar eclipse end at dawn/dusk; invasions track kills
  defaultTargetKills: number;
  hardmodeOnly?: boolean;
  musicTheme: string;
}

export const EVENTS: Record<EventId, EventDef> = {
  blood_moon: {
    id: 'blood_moon',
    name: 'Blood Moon',
    announcement: 'The Blood Moon is rising...',
    endAnnouncement: 'The Blood Moon fades with the dawn.',
    skyTint: '#8a141c',
    isTimed: true,
    defaultTargetKills: 0,
    musicTheme: 'eerie',
  },
  slime_rain: {
    id: 'slime_rain',
    name: 'Slime Rain',
    announcement: 'Slime is falling from the sky!',
    endAnnouncement: 'Slime has stopped falling from the sky.',
    skyTint: '#59a6ff',
    isTimed: false,
    defaultTargetKills: 75,
    musicTheme: 'forest_day',
  },
  goblin_army: {
    id: 'goblin_army',
    name: 'Goblin Army',
    announcement: 'A Goblin Army is approaching from the west!',
    endAnnouncement: 'A Goblin Army has been defeated!',
    skyTint: '#5c6b4e',
    isTimed: false,
    defaultTargetKills: 80,
    musicTheme: 'boss',
  },
  pirate_invasion: {
    id: 'pirate_invasion',
    name: 'Pirate Invasion',
    announcement: 'Pirates are approaching from the east!',
    endAnnouncement: 'The Pirates have been defeated!',
    skyTint: '#8c6b48',
    isTimed: false,
    defaultTargetKills: 100,
    hardmodeOnly: true,
    musicTheme: 'boss',
  },
  solar_eclipse: {
    id: 'solar_eclipse',
    name: 'Solar Eclipse',
    announcement: 'A solar eclipse is happening!',
    endAnnouncement: 'Sunlight returns as the eclipse passes.',
    skyTint: '#2b1c12',
    isTimed: true,
    defaultTargetKills: 0,
    hardmodeOnly: true,
    musicTheme: 'eerie',
  },
  frost_legion: {
    id: 'frost_legion',
    name: 'Frost Legion',
    announcement: 'The Frost Legion is approaching!',
    endAnnouncement: 'The Frost Legion has melted away!',
    skyTint: '#cceeff',
    isTimed: false,
    defaultTargetKills: 90,
    hardmodeOnly: true,
    musicTheme: 'snow',
  },
  pumpkin_moon: {
    id: 'pumpkin_moon',
    name: 'Pumpkin Moon',
    announcement: 'The Pumpkin Moon is rising...',
    endAnnouncement: 'The Pumpkin Moon vanishes at dawn.',
    skyTint: '#7a3508',
    isTimed: true,
    defaultTargetKills: 0,
    hardmodeOnly: true,
    musicTheme: 'boss',
  },
  frost_moon: {
    id: 'frost_moon',
    name: 'Frost Moon',
    announcement: 'The Frost Moon is rising...',
    endAnnouncement: 'The Frost Moon subsides at dawn.',
    skyTint: '#1e4a78',
    isTimed: true,
    defaultTargetKills: 0,
    hardmodeOnly: true,
    musicTheme: 'boss',
  },
  martian_madness: {
    id: 'martian_madness',
    name: 'Martian Madness',
    announcement: 'Martians are invading!',
    endAnnouncement: 'The Martian fleet has retreated!',
    skyTint: '#1f4f4c',
    isTimed: false,
    defaultTargetKills: 120,
    hardmodeOnly: true,
    musicTheme: 'boss',
  },
  old_ones_army: {
    id: 'old_ones_army',
    name: "Old One's Army",
    announcement: "The Old One's Army is approaching!",
    endAnnouncement: 'The Etherian portals seal shut!',
    skyTint: '#46266b',
    isTimed: false,
    defaultTargetKills: 90,
    musicTheme: 'boss',
  },
  lunar_events: {
    id: 'lunar_events',
    name: 'Lunar Events',
    announcement: 'Celestial creatures are invading!',
    endAnnouncement: 'Impending doom approaches...',
    skyTint: '#10263b',
    isTimed: false,
    defaultTargetKills: 100,
    hardmodeOnly: true,
    musicTheme: 'lunar',
  },
};
