// Exercise the existing source-bound wire and validator contracts independently
// of the production policy that decides whether to request language help.
import {createLiveSemanticInterpreter as createProductionInterpreter} from './live-semantic.mjs';
export {liveSemanticContract} from './live-semantic.mjs';

export async function createLiveSemanticInterpreter(options) {
    const interpret=await createProductionInterpreter(options);
    interpret.languageFallbackOnly=false;
    return interpret;
}
