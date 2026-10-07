/**
 * DRS HUB SERVER WIRE CONTRACT (external API boundary).
 *
 * The DRS Hub backend still exposes a few fields under legacy wire
 * names. Renaming them client-side would break every API call against
 * the deployed server, so the client keeps speaking the server's
 * protocol at the transport boundary only.
 *
 * These literals are the ONLY place in the codebase where legacy wire
 * names may appear. All request bodies and typed response fields must
 * reference these constants. Once the server renames its fields, flip
 * the values here and every call site follows automatically.
 */
export const DRS_HUB_WIRE = {
  /**
   * Request-body field that identifies an assistant on endpoints that
   * mutate reviews and purchases (server contract, POST bodies).
   */
  assistantIdField: 'assistant_id',
  /**
   * Response field in the my-assistants summary that reports how many
   * assistants the user has created (server contract, GET response).
   */
  totalAssistantsField: 'total_assistants',
} as const;
