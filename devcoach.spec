# -*- mode: python ; coding: utf-8 -*-
import sys
from pathlib import Path

src = Path("src/devcoach")

datas = [
    (str(src / "SKILL.md"), "devcoach"),
    (str(src / "web" / "templates"), "devcoach/web/templates"),
    (str(src / "web" / "static"), "devcoach/web/static"),
]

hidden_imports = [
    # pydantic-core is a compiled extension — ensure it's picked up
    "pydantic_core",
    "pydantic_core._pydantic_core",
    # fastmcp / mcp internals that may be dynamically imported
    "mcp",
    "mcp.server",
    "mcp.server.stdio",
    "mcp.types",
    # uvicorn needs these
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    # email / multipart used by starlette
    "email.mime.multipart",
    "email.mime.text",
    "email.mime.base",
    # sqlite3 is stdlib but needs explicit inclusion on some platforms
    "sqlite3",
    "_sqlite3",
]

a = Analysis(
    ["src/devcoach/mcp/server.py"],
    pathex=["src"],
    binaries=[],
    datas=datas,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "numpy", "scipy", "PIL"],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="devcoach",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
