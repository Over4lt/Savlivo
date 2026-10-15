// A source-specific research failure can end one logical target without making
// the enclosing batch or its checkpoint unsafe to continue.
export class TargetResearchFailure extends Error {
 constructor(code){super(code);this.name='TargetResearchFailure';}
}
