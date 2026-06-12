"""devcoach — Progressive technical coaching via MCP."""

from importlib.metadata import PackageNotFoundError, version

try:
    __version__ = version("devcoach")
except PackageNotFoundError:  # source tree without an installed distribution
    __version__ = "0.0.0+unknown"
