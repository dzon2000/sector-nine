import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it} from "vitest";
import {createGame} from "../src/domain/model";
import {ChapterThreePanel} from "../src/ui/ChapterThreePanel";

it("offers Chapter IV only after the last Chapter III contract and preserves free play",()=>{
  const game=createGame();
  game.chapterIII={route:"independent",completed:["M11","M12"],active:null};
  const render=()=>renderToStaticMarkup(createElement(ChapterThreePanel, {game,
    onStart:()=>{}, onAccept:()=>{}, onChoose:()=>{}, onStartChapterIV:()=>{}}));
  expect(render()).not.toContain("Start Chapter IV");
  game.chapterIII.completed.push("M13");
  const offer=render();
  expect(offer).toContain("Continue operating in free play.");
  expect(offer).toContain("Start Chapter IV");
});
