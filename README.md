# Horizontal Tabs for Safari

A Safari extension that displays your open tabs in a vertical sidebar with favicons for easy navigation.

![Horizontal Tabs Screenshot](screenshot.png)

## Features

- 📑 Vertical sidebar showing all open tabs
- 🎯 Click to switch tabs instantly
- 📌 Pinned tabs displayed at the top
- 🎨 Colorful letter icons for sites without favicons
- 🌓 Dark mode support
- ⚡ Real-time updates as you open/close tabs
- 🅰 Uses a fallback favicon when a site’s icon can’t be loaded

## Installation

### From Mac App Store

Coming soon!

### From Source

1. Clone this repository
2. Open `HorizontalTabs.xcodeproj` in Xcode
3. Build and run (⌘R)
4. In Safari: Settings → Extensions → Enable "Horizontal Tabs"
5. Click "Always Allow" for permissions

## Requirements

- macOS 11.0 or later
- Safari 14.0 or later

## Known Limitations

### Safari Extension Restrictions

Due to Safari's extension security model, some features are currently not available:

- **Drag and drop reordering** - Safari's content script sandbox prevents reliable drag-and-drop within the sidebar. To reorder tabs, use Safari's native tab bar.
- **Pin/Unpin from sidebar** - Right-click context menus in content scripts have limited reliability in Safari. To pin/unpin tabs, right-click the tab in Safari's tab bar and select "Pin Tab" or "Unpin Tab".

### Page Compatibility

The sidebar uses a layout technique that may conflict with:
- Sites using complex CSS transforms or 3D animations
- Some accessibility zoom features
- Single-page apps with custom view transitions

If you experience layout issues on specific sites, please [report them on GitHub](https://github.com/gorvis/horizontal-tabs-safari-extension/issues).

### Workarounds

- **Reordering tabs:** Drag tabs in Safari's native tab bar
- **Pinning tabs:** Right-click tabs in Safari's tab bar → "Pin Tab"
- **Closing tabs:** Click the X on tabs in Safari's tab bar, or use Cmd+W

## Support the Developer

If you find this useful, please consider:
☕ [Buy me a coffee](https://buymeacoffee.com/gorvis)

## License

This project is licensed under a custom non-commercial license. See [LICENSE](LICENSE) for details.

## Author

Guinevere Orvis
