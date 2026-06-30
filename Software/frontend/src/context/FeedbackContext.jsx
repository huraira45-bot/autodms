import { createContext, useContext } from 'react';

export const FeedbackContext = createContext(null);

export function useFeedback() {
    const value = useContext(FeedbackContext);
    if (!value) {
        throw new Error('useFeedback must be used inside FeedbackProvider');
    }
    return value;
}
