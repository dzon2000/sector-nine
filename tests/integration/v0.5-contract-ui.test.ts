import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import {createGame} from "../../src/domain/model";
import {ChapterThreePanel} from "../../src/ui/ChapterThreePanel";

const afterChapterTwo=()=>{
  const game=createGame();
  game.mission.activeId="DONE";
  game.chapterII={foundryCompleted:true,started:true,completed:true,storySeen:true,metrics:null};
  return game;
};

const actions={onStart:()=>{},onAccept:()=>{},onChoose:()=>{}};

describe("Chapter III contract display",()=>{
  it("offers an explicit start after Chapter II",()=>{
    expect(renderToStaticMarkup(createElement(ChapterThreePanel,{game:afterChapterTwo(),...actions})))
      .toContain("Start Chapter III");
  });

  it("surfaces the approved interlock objective on either route",()=>{
    const game={...afterChapterTwo(),chapterIII:{
      route:"corporate" as const,completed:["M11","M12"] as ("M11"|"M12")[],active:null
    }};
    const html=renderToStaticMarkup(createElement(ChapterThreePanel,{game,...actions}));
    expect(html).toContain("Reconstruct Prometheus");
    expect(html).toContain("mechanical interlock");
    expect(html).toContain("600.00 Cr");
    expect(html).toContain("Accept Contract");
  });
});
