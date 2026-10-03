//
//  AskAssistantIntent.swift
//  DrsAI
//
//  App Intent for asking a Assistant a question via Siri
//

import Foundation
import AppIntents

@available(iOS 16.0, *)
struct AskAssistantIntent: AppIntent {
    static var title: LocalizedStringResource = "Ask Assistant"
    static var description = IntentDescription("Ask a question to a specific Assistant and get an AI response")
    
    static var openAppWhenRun: Bool = false // Run in background
    
    @Parameter(title: "Assistant", description: "The Assistant to ask")
    var assistant: AssistantEntity
    
    @Parameter(title: "Message", description: "Your question or message")
    var message: String
    
    static var parameterSummary: some ParameterSummary {
        Summary("Ask \(\.$assistant) \(\.$message)")
    }
    
    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
        // Validate inputs
        guard !message.isEmpty else {
            print("[AskAssistantIntent] Error: Empty message")
            throw AskAssistantError.emptyMessage
        }

        // We MUST have a model path from the assistant
        guard let assistantModelPath = assistant.defaultModelPath else {
            print("[AskAssistantIntent] Error: Assistant has no default model")
            throw AskAssistantError.noModelAvailable
        }

        // Verify the file exists
        let fileManager = FileManager.default
        guard fileManager.fileExists(atPath: assistantModelPath) else {
            print("[AskAssistantIntent] Error: Model file not found at path")
            throw AskAssistantError.noModelAvailable
        }

        // Initialize inference engine
        let inferenceEngine = LlamaInferenceEngine.shared

        do {
            // Load model if not already loaded
            try await inferenceEngine.loadModel(at: assistantModelPath)

            // Try to load cached session
            var finalSystemPrompt = assistant.systemPrompt
            if let params = assistant.parameters, !params.isEmpty {
                finalSystemPrompt = MustacheRenderer.render(template: assistant.systemPrompt, parameters: params)
                print("[LlamaInferenceEngine] Rendered system prompt: \(finalSystemPrompt)")
            }

            // Use model ID for cache validation
            // Fallback to model path if ID is not available (shouldn't happen though )
            let modelId = assistant.defaultModelId ?? assistantModelPath

            _ = await inferenceEngine.loadSessionCache(
                assistantId: assistant.id,
                modelId: modelId,
                systemPrompt: finalSystemPrompt
            )

            let response = try await inferenceEngine.runInference(
                systemPrompt: finalSystemPrompt,
                userMessage: message,
                completionSettings: assistant.completionSettings,
                parameters: assistant.parameters
            )

            print("[AskAssistantIntent] Inference completed. Response length: \(response.count) chars")

            // Schedule model release after a short delay to save memory
            Task {
                try? await Task.sleep(nanoseconds: 30_000_000_000) // 30 seconds
                print("[AskAssistantIntent] Releasing model after delay")
                await inferenceEngine.releaseModel()
            }

            // Return with dialog so Siri can speak it
            return .result(
                value: response,
                dialog: IntentDialog(stringLiteral: response)
            )

        } catch {
            print("[AskAssistantIntent] Error during inference: \(error.localizedDescription)")
            throw AskAssistantError.inferenceFailed(error.localizedDescription)
        }
    }
}

// MARK: - Errors

enum AskAssistantError: Error, LocalizedError {
    case emptyMessage
    case noModelAvailable
    case inferenceFailed(String)
    
    var errorDescription: String? {
        switch self {
        case .emptyMessage:
            return "Please provide a message to send to the Assistant"
        case .noModelAvailable:
            return "No AI model is available. Please download a model in the DrsAI app first."
        case .inferenceFailed(let details):
            return "Failed to generate response: \(details)"
        }
    }
}

