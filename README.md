## Features

### Split card state

Problem: some controls from basic styles (top of the right column)

Currently, we keep it in a single large object;
Should be split to:
- content: whatever is in the left column form
- basic controls: the controls above the card in right column
- advanced controles: the controls in drawer

Behavior when advanced options conflict with basic options: use advanced options; introduce "not selected" state for the basic options.


### Simplify border management

Currently: image shape and border thickness are separate controls.
Merge into a single control: either there's no border (which implies roundness)


## Bugs

## Completed

### Image transformation controls
- add controls into the drawer: "Flip vertically", "Flip horizontally"
- each control is a toggle, on/off
- can be achieved using `scale()` probably, but need a css only solution at the very least
- use appropriate icons; 

### Image rotation control
- in drawer
- control: explore possibilities, if nothing better comes up default to a slider
- values should go from 0 to 360
- needs to support `shape-outside`

### Simplify border management

Currently: image shape and border thickness are separate controls.
Merge into a single control: either there's no border (which implies roundness)