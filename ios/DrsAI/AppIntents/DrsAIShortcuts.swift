//
//  DrsAIShortcuts.swift
//  DrsAI
//
//  App Shortcuts provider for DrsAI
//

import Foundation
import AppIntents

@available(iOS 16.0, *)
struct DrsAIShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AskAssistantIntent(),
            phrases: [
                "Ask \(.applicationName)",
                "Ask my \(.applicationName) assistant",
                "Question for \(.applicationName)",
            ],
            shortTitle: "Ask Assistant",
            systemImageName: "message.fill"
        )
        
        AppShortcut(
            intent: OpenAssistantChatIntent(),
            phrases: [
                "Open \(.applicationName) chat",
                "Chat with my assistant in \(.applicationName)",
                "Start \(.applicationName) conversation",
            ],
            shortTitle: "Open Chat",
            systemImageName: "bubble.left.and.bubble.right.fill"
        )
    }
}

