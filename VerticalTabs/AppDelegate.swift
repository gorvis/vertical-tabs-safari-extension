//
//  AppDelegate.swift
//  VerticalTabs
//
//  Created by Guinevere Orvis on 2026-01-13.
//

import Cocoa

@main
class AppDelegate: NSObject, NSApplicationDelegate {

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Host app shows extension status and links to Safari Settings
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

}
