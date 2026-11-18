import {rotate,type Direction,type SplitterMode} from "../domain/model";

interface SplitterOutlet {
  mode:"forward"|"clockwise";
  direction:Direction;
  preferred:boolean;
}

export function splitterOutlets(facing:Direction,mode:SplitterMode="alternating"):readonly [SplitterOutlet,SplitterOutlet] {
  return [
    {mode:"forward",direction:facing,preferred:mode==="forward"},
    {mode:"clockwise",direction:rotate(facing),preferred:mode==="clockwise"},
  ];
}
