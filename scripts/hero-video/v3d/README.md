3D footage capture. Software-rendered WebGL is too slow to film in real time, so vt.js swaps the page's
clock (performance.now, Date.now, timers, requestAnimationFrame) for a virtual one. rec3d.py then
advances it 1/30 s per screenshot, which makes the footage smooth whatever the render speed (~2.5 s/frame).

    python3 rec3d.py <name> <force> <cam> [dpr]     e.g.  python3 rec3d.py bomb_chase bomb low
                                                           python3 rec3d.py breakaway_bcast breakaway broadcast
force = any data-force button on /chase-cam (bomb, breakaway, complete, sack, int, ...)
cam   = low (chase) | wide | broadcast | high

Frames go to frames/<name>/. Copy them to motion/v3d/<dir>/ and list the segments in motion/shots.js.
