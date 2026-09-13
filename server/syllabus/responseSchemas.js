export const questionSchema = {
  type: 'object', additionalProperties: false, required: ['question'],
  properties: { question: { type: 'string', minLength: 1, maxLength: 1500 } },
};
export const verdictSchema = {
  type: 'object', additionalProperties: false, required: ['verified', 'feedback'],
  properties: { verified: { type: 'boolean' }, feedback: { type: 'string', minLength: 1, maxLength: 1500 } },
};
