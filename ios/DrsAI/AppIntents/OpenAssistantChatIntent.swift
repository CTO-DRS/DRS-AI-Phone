//
//  OpenAssistantChatIntent.swift
//  DrsAI
//
//  App Intent for opening a Assistant's chat screen
//

import Foundation
import AppIntents

@available(iOS 16.0, *)
struct OpenAssistantChatIntent: AppIntent {
    static var title: LocalizedStringResource = "Open Assistant Chat"
    static var description = IntentDescription("Open DrsAI and start chatting with a specific Assistant")
    
    static var openAppWhenRun: Bool = true // Open the app
    
    @Parameter(title: "Assistant", description: "The Assistant to chat with")
    var assistant: AssistantEntity
    
    @Parameter(title: "Message", description: "Optional message to prefill", default: nil)
    var message: String?
    
    static var parameterSummary: some ParameterSummary {
        Summary("Open chat with \(\.$assistant)") {
            \.$message
        }
    }
    
    @MainActor
    func perform() async throws -> some IntentResult {
        // Build deep link URL
        var urlComponents = URLComponents()
        urlComponents.scheme = "drsai"
        urlComponents.host = "chat"
        
        var queryItems: [URLQueryItem] = [
            URLQueryItem(name: "assistantId", value: assistant.id),
            URLQueryItem(name: "assistantName", value: assistant.name)
        ]
        
        if let message = message, !message.isEmpty {
            queryItems.append(URLQueryItem(name: "message", value: message))
        }
        
        urlComponents.queryItems = queryItems
        
        guard let url = urlComponents.url else {
            throw OpenAssistantChatError.invalidURL
        }
        
        // Open the URL
        await UIApplication.shared.open(url)
        
        return .result()
    }
}

// MARK: - Errors

enum OpenAssistantChatError: Error, LocalizedError {
    case invalidURL
    
    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Failed to create deep link URL"
        }
    }
}

