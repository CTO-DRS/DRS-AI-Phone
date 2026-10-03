//
//  AssistantEntity.swift
//  DrsAI
//
//  App Intents entity representing a Assistant for Siri and Shortcuts
//

import Foundation
import AppIntents

/// Represents a Assistant entity for use in App Intents
@available(iOS 16.0, *)
struct AssistantEntity: AppEntity {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Assistant"
    
    static var defaultQuery = AssistantEntityQuery()
    
    var id: String
    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)")
    }
    
    // Assistant properties
    var name: String
    var systemPrompt: String
    var defaultModelPath: String? // Path to the downloaded model file
    var defaultModelId: String? // Model ID for cache validation
    var completionSettings: [String: Any]?
    var parameters: [String: Any]? // Template parameter values
    var parameterSchema: [[String: Any]]? // Template parameter schema

    init(id: String, name: String, systemPrompt: String, defaultModelPath: String? = nil, defaultModelId: String? = nil, completionSettings: [String: Any]? = nil, parameters: [String: Any]? = nil, parameterSchema: [[String: Any]]? = nil) {
        self.id = id
        self.name = name
        self.systemPrompt = systemPrompt
        self.defaultModelPath = defaultModelPath
        self.defaultModelId = defaultModelId
        self.completionSettings = completionSettings
        self.parameters = parameters
        self.parameterSchema = parameterSchema
    }
}

/// Query provider for Assistant entities
@available(iOS 16.0, *)
struct AssistantEntityQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [AssistantEntity] {
        let allAssistants = try await AssistantDataProvider.shared.fetchAllAssistants()
        return allAssistants.filter { identifiers.contains($0.id) }
    }
    
    func suggestedEntities() async throws -> [AssistantEntity] {
        // Return all available assistants as suggestions
        return try await AssistantDataProvider.shared.fetchAllAssistants()
    }
}

/// String query for finding assistants by name
@available(iOS 16.0, *)
extension AssistantEntityQuery: EntityStringQuery {
    func entities(matching string: String) async throws -> [AssistantEntity] {
        let allAssistants = try await AssistantDataProvider.shared.fetchAllAssistants()
        
        if string.isEmpty {
            return allAssistants
        }
        
        // Case-insensitive search
        return allAssistants.filter { assistant in
            assistant.name.localizedCaseInsensitiveContains(string)
        }
    }
}

