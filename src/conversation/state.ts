export enum ConversationState {
  NEW                         = 'new',
  ONBOARDING_CUISINE          = 'onboarding_cuisine',
  ONBOARDING_DIETARY          = 'onboarding_dietary',
  ONBOARDING_HOUSEHOLD        = 'onboarding_household',
  ONBOARDING_SKILL            = 'onboarding_skill',
  ONBOARDING_COOK_DAYS        = 'onboarding_cook_days',
  ONBOARDING_GROCERY_DAY      = 'onboarding_grocery_day',
  ONBOARDING_REMINDER_TIME    = 'onboarding_reminder_time',
  ONBOARDING_INVENTORY        = 'onboarding_inventory',
  ONBOARDING_MAX_MESSAGES     = 'onboarding_max_messages',
  ONBOARDING_CONFIRM          = 'onboarding_confirm',
  IDLE                        = 'idle',
  AWAITING_INVENTORY_CONFIRM  = 'awaiting_inventory_confirm',
  AWAITING_MEAL_PLAN_APPROVAL = 'awaiting_meal_plan_approval',
  AWAITING_COOK_FEEDBACK      = 'awaiting_cook_feedback',
  AWAITING_GROCERY_CONFIRM    = 'awaiting_grocery_confirm',
}

export function isOnboardingState(state: ConversationState): boolean {
  return state.startsWith('onboarding_') || state === ConversationState.NEW;
}
