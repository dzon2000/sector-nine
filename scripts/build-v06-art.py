#!/usr/bin/env python3
"""Build the Pixi atlas and static review boards from the original RGBA sprite sheet."""

import argparse
import json
from pathlib import Path
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'src/rendering/assets'
PREVIEWS = ROOT / 'docs/specifications/art'
TILE = 44
FRAME_STRIDE = 48
ATLAS_SIZE = 256
FONT = 'Adwaita-Mono-Bold'
DIRECTIONS = {'N': (0, -1), 'E': (1, 0), 'S': (0, 1), 'W': (-1, 0)}
CLOCKWISE = dict(zip(DIRECTIONS, ('E', 'S', 'W', 'N')))
CROPS = {
    'iron_mine': (29, 65, 290, 287),
    'coal_mine': (296, 69, 560, 287),
    'copper_mine': (579, 66, 828, 288),
    'silicon_extractor': (848, 76, 1089, 288),
    'furnace': (1102, 66, 1375, 287),
    'advanced_furnace': (19, 356, 299, 564),
    'assembler': (305, 352, 564, 564),
    'circuit_fabricator': (579, 360, 825, 564),
    'coal_generator': (839, 354, 1106, 565),
    'sell_terminal': (299, 639, 572, 840),
    'iron_ore': (620, 644, 788, 805),
    'coal': (884, 648, 1064, 801),
    'copper_ore': (1160, 649, 1330, 803),
    'silicon': (79, 887, 260, 1073),
    'iron_ingot': (333, 917, 539, 1058),
    'steel': (617, 899, 799, 1065),
    'gear': (870, 886, 1071, 1078),
    'circuit': (1159, 901, 1333, 1072),
}
CARGO = tuple(CROPS)[10:]


def magick(*args, capture=False):
    result = subprocess.run(
        ['magick', *map(str, args)], check=True,
        stdout=subprocess.PIPE if capture else None, text=capture,
    )
    return result.stdout


def crop_geometry(left, top, right, bottom):
    return f'{right-left}x{bottom-top}+{left}+{top}'


def size(path):
    return tuple(map(int, magick(path, '-format', '%w %h', 'info:', capture=True).split()))


def rectangle(box, color):
    x1, y1, x2, y2 = box
    return f"fill '{color}' stroke none rectangle {x1},{y1} {x2},{y2}"


def transport_art(kind):
    # North is the source orientation. Cloth slats and rails have no baked arrows.
    commands = []
    vertical = 13 if kind == 'conveyor' else 11
    for box, color in (
        ((vertical, 2, 43-vertical, 41), '#111720'),
        ((vertical+1, 3, 42-vertical, 40), '#697381'),
        ((vertical+4, 3, 39-vertical, 40), '#2a313d'),
    ):
        commands.append(rectangle(box, color))
    for y in range(4, 40, 4):
        commands.append(rectangle((vertical+5, y, 38-vertical, y+1), '#495362'))
    if kind == 'splitter':
        for box, color in (
            ((20, 11, 41, 32), '#111720'),
            ((20, 12, 40, 31), '#697381'),
            ((20, 15, 40, 28), '#2a313d'),
        ):
            commands.append(rectangle(box, color))
        for x in range(24, 40, 4):
            commands.append(rectangle((x, 16, x+1, 27), '#495362'))
        commands.extend([
            rectangle((15, 15, 28, 28), '#1d2631'),
            rectangle((17, 17, 26, 26), '#9b672a'),
            rectangle((18, 18, 25, 24), '#d39846'),
        ])
    return ' '.join(commands)


def build_atlas(sheet, temp):
    sprites = {}
    for name, box in CROPS.items():
        trimmed = temp / f'{name}.png'
        limit = 15 if name in CARGO else 34
        magick(sheet, '-crop', crop_geometry(*box), '+repage', '-channel', 'A',
               '-fx', 'a < 0.30 ? 0 : a', '+channel', '-trim', '+repage',
               '-filter', 'point', '-resize', f'{limit}x{limit}', trimmed)
        sprites[name] = trimmed

    for name in ('conveyor', 'splitter'):
        trimmed = temp / f'{name}.png'
        magick('-size', f'{TILE}x{TILE}', 'xc:none', '+antialias',
               '-draw', transport_art(name), '-trim', '+repage', trimmed)
        sprites[name] = trimmed

    frames = {}
    atlas = ['-size', f'{ATLAS_SIZE}x{ATLAS_SIZE}', 'xc:none']
    for index, (name, path) in enumerate(sprites.items()):
        width, height = size(path)
        offset_x, offset_y = (TILE-width)//2, (TILE-height)//2
        if name in CARGO:
            # Use one centered 44px source convention. Board positions cargo independently.
            offset_x, offset_y = (TILE-width+1)//2, (TILE-height+1)//2
        x = (index % 5) * FRAME_STRIDE + offset_x + 2
        y = (index // 5) * FRAME_STRIDE + offset_y + 2
        frames[name] = {
            'frame': {'x': x, 'y': y, 'w': width, 'h': height},
            'rotated': False,
            'trimmed': True,
            'spriteSourceSize': {'x': offset_x, 'y': offset_y, 'w': width, 'h': height},
            'sourceSize': {'w': TILE, 'h': TILE},
            'anchor': {'x': 0.5, 'y': 0.5},
        }
        atlas += [path, '-geometry', f'+{x}+{y}', '-composite']

    image_name = 'sector-nine-v06.png'
    magick(*atlas, f'PNG32:{ASSETS / image_name}')
    metadata = {
        'frames': frames,
        'meta': {
            'image': image_name, 'format': 'RGBA8888',
            'size': {'w': ATLAS_SIZE, 'h': ATLAS_SIZE}, 'scale': '1',
        },
    }
    (ASSETS / 'sector-nine-v06.json').write_text(json.dumps(metadata, indent=2) + '\n')
    return frames


def arrow(center_x, center_y, direction, color, distance=16):
    dx, dy = DIRECTIONS[direction]
    tx, ty = center_x + dx*distance, center_y + dy*distance
    points = [
        (tx, ty),
        (tx-dx*6-dy*4, ty-dy*6+dx*4),
        (tx-dx*6+dy*4, ty-dy*6-dx*4),
    ]
    coords = ' '.join(f'{x},{y}' for x, y in points)
    back_x, back_y = tx-dx*8, ty-dy*8
    return (
        f"stroke '#101a27' stroke-width 4 line {back_x},{back_y} {tx},{ty} "
        f"stroke '{color}' stroke-width 2 line {back_x},{back_y} {tx},{ty} "
        f"fill '{color}' stroke '#101a27' stroke-width 1 polygon {coords}"
    )


def build_boards(frames, temp):
    # This fixed fixture exercises every frame and all splitter directions across the board.
    entities = [
        (2, 2, 'iron_mine', 'E', 'iron_ore'),
        (3, 2, 'conveyor', 'E', 'iron_ore'),
        (4, 2, 'furnace', 'E', 'iron_ingot'),
        (5, 2, 'conveyor', 'E', 'iron_ingot'),
        (6, 2, 'assembler', 'S', 'gear'),
        (8, 2, 'copper_mine', 'S', 'copper_ore'),
        (8, 3, 'conveyor', 'S', 'copper_ore'),
        (8, 4, 'splitter', 'S', 'copper_ore'),
        (7, 4, 'conveyor', 'W', 'copper_ore'),
        (6, 3, 'conveyor', 'S', 'gear'),
        (6, 4, 'conveyor', 'S', 'gear'),
        (6, 5, 'splitter', 'E', 'gear'),
        (7, 5, 'conveyor', 'E', 'gear'),
        (8, 5, 'circuit_fabricator', 'E', 'circuit'),
        (9, 5, 'conveyor', 'E', 'circuit'),
        (10, 5, 'sell_terminal', 'W', None),
        (6, 6, 'conveyor', 'S', 'gear'),
        (6, 7, 'splitter', 'N', None),
        (7, 7, 'conveyor', 'E', 'gear'),
        (8, 7, 'conveyor', 'N', 'silicon'),
        (8, 6, 'conveyor', 'N', 'silicon'),
        (8, 8, 'conveyor', 'N', 'silicon'),
        (8, 9, 'silicon_extractor', 'N', 'silicon'),
        (7, 9, 'coal_mine', 'N', 'coal'),
        (7, 8, 'conveyor', 'W', 'coal'),
        (6, 8, 'coal_generator', 'W', None),
        (5, 9, 'conveyor', 'N', 'coal'),
        (5, 8, 'splitter', 'W', 'coal'),
        (4, 8, 'conveyor', 'W', 'coal'),
        (3, 8, 'advanced_furnace', 'N', 'steel'),
        (3, 7, 'conveyor', 'N', 'steel'),
        (3, 6, 'conveyor', 'E', 'steel'),
        (4, 6, 'conveyor', 'E', 'steel'),
        (5, 6, 'conveyor', 'N', None),
        (2, 9, 'iron_mine', 'N', 'iron_ore'),
        (2, 8, 'conveyor', 'E', 'iron_ore'),
    ]
    deposits = [
        (3, 5, 'Fe', '#715f41'), (2, 2, 'Fe', '#715f41'), (2, 9, 'Fe', '#715f41'),
        (7, 9, 'C', '#464c55'), (5, 9, 'C', '#464c55'), (8, 2, 'Cu', '#9b754d'),
        (8, 9, 'Si', '#596d88'),
    ]
    board_args = ['-size', '528x528', 'xc:#101a27', '-font', FONT]
    grid = [
        rectangle(
            (x*TILE+1, y*TILE+1, (x+1)*TILE-2, (y+1)*TILE-2),
            '#1a2938' if (x+y) % 2 else '#203144',
        )
        for y in range(12) for x in range(12)
    ]
    board_args += ['-draw', ' '.join(grid)]
    for x, y, label, color in deposits:
        px, py = x*TILE+22, y*TILE+22
        board_args += [
            '-pointsize', '12',
            '-draw', f"fill '{color}' circle {px},{py} {px+15},{py} "
            f"fill '#f2e4c5' text {px-4*len(label)},{py+4} '{label}'",
        ]

    atlas = ASSETS / 'sector-nine-v06.png'
    for x, y, name, direction, cargo in entities:
        left, top = x*TILE, y*TILE
        cx, cy = left+22, top+22
        sprite = frames[name]
        frame, offset = sprite['frame'], sprite['spriteSourceSize']
        tile = temp / f'tile-{name}-{direction}.png'
        tile_args = [
            '-size', '44x44', 'xc:none', '(', atlas, '-crop',
            f"{frame['w']}x{frame['h']}+{frame['x']}+{frame['y']}", '+repage', ')',
            '-geometry', f"+{offset['x']}+{offset['y']}", '-composite',
        ]
        if name in ('splitter', 'conveyor'):
            tile_args += ['-rotate', str(list(DIRECTIONS).index(direction)*90)]
        magick(*tile_args, tile)
        board_args += [tile, '-geometry', f'+{left}+{top}', '-composite']
        if (x, y) in ((6, 5), (6, 7)):
            outline = '#f2eee2' if (x, y) == (6, 5) else '#b5e7ff'
            board_args += [
                '-draw', f"fill none stroke '{outline}' stroke-width 2 "
                f"rectangle {left+2},{top+2} {left+41},{top+41}",
            ]
        if name != 'sell_terminal':
            forward_color = '#ffcd63' if (x, y) == (8, 4) else '#eef8fe'
            board_args += ['-draw', arrow(cx, cy, direction, forward_color)]
        if name == 'splitter':
            clockwise_color = '#ffcd63' if (x, y) in ((6, 5), (5, 8)) else '#eef8fe'
            board_args += ['-draw', arrow(cx, cy, CLOCKWISE[direction], clockwise_color)]
        if cargo:
            cargo_frame = frames[cargo]['frame']
            badge_x, badge_y = left+3, top+3
            blocked = (x, y) in ((6, 5), (7, 5))
            border = '#ff9177' if blocked else '#7999ac'
            plate = '#465362' if cargo == 'coal' else '#101a27'
            board_args += [
                '-draw', f"fill '{plate}' stroke '{border}' stroke-width 1 "
                f"roundrectangle {badge_x},{badge_y} {badge_x+16},{badge_y+16} 3,3",
                '(', atlas, '-crop',
                f"{cargo_frame['w']}x{cargo_frame['h']}+{cargo_frame['x']}+{cargo_frame['y']}",
                '+repage', ')', '-geometry',
                f"+{badge_x+(17-cargo_frame['w'])//2}+{badge_y+(17-cargo_frame['h'])//2}",
                '-composite',
            ]
        if name in ('furnace', 'advanced_furnace', 'assembler', 'circuit_fabricator'):
            buffer = {'furnace': 'Fe 2', 'advanced_furnace': 'Fe 1 / C 2',
                      'assembler': 'Fe 1', 'circuit_fabricator': 'Cu 2 / Si 1'}[name]
            board_args += [
                '-pointsize', '6',
                '-draw', f"fill '#10202e' stroke none rectangle {left+3},{top+35} "
                f"{left+40},{top+42} fill '#e7f4fb' text {left+5},{top+41} '{buffer}'",
            ]
        if (x, y) == (5, 9):
            board_args += [
                '-pointsize', '8',
                '-draw', f"fill '#464c55' stroke '#a0b1bd' stroke-width 1 circle "
                f"{left+35},{top+8} {left+40},{top+8} fill white stroke none "
                f"text {left+33},{top+11} 'C'",
            ]

    desktop = PREVIEWS / 'v0.6-board-528.png'
    magick(*board_args, f'PNG24:{desktop}')
    magick(desktop, '-filter', 'point', '-resize', '360x360', PREVIEWS / 'v0.6-board-360.png')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('sheet', type=Path, help='Original 1402 × 1122 RGBA generated sprite sheet')
    args = parser.parse_args()
    if size(args.sheet) != (1402, 1122):
        parser.error('Expected the original 1402 × 1122 sheet.')
    ASSETS.mkdir(parents=True, exist_ok=True)
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as directory:
        temp = Path(directory)
        build_boards(build_atlas(args.sheet, temp), temp)
