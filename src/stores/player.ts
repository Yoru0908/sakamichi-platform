import { atom } from 'nanostores';

export interface PlayerState {
  station: string | null;
  stationName: string | null;
  isPlaying: boolean;
  volume: number;
  currentProgram: { name: string; time: string } | null;
}

const defaultPlayer: PlayerState = {
  station: null,
  stationName: null,
  isPlaying: false,
  volume: 0.8,
  currentProgram: null,
};

export const $player = atom<PlayerState>(defaultPlayer);

export function setPlayerState(state: Partial<PlayerState>) {
  $player.set({ ...$player.get(), ...state });
}

export function togglePlayback() {
  const current = $player.get();
  $player.set({ ...current, isPlaying: !current.isPlaying });
}
