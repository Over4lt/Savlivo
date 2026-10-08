// Preserve historical time-to-first-result assertions while the permanent
// catalog objective continues beyond that offering-level result.
export function firstEstablishedUsage(result) {
    return result.trace.find(t=>t.event==='OBSERVATION'&&t.evaluations?.established)?.usage??result.usage;
}
export function firstEstablishedAttempts(knowledge) {
    const event=knowledge.trace.find(t=>t.event==='OBSERVATION'&&t.evaluations?.established);
    return event?knowledge.attempts.slice(0,event.usage.actions):knowledge.attempts;
}
