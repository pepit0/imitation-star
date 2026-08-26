declare module "ogv" {
  export const OGVLoader: { base: string };
  export class OGVPlayer extends HTMLElement {
    src: string;
    currentTime: number;
    duration: number;
    paused: boolean;
    videoWidth: number;
    videoHeight: number;
    play(): Promise<void>;
    pause(): void;
  }
}
