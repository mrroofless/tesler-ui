import {AnyAction, Dispatch, Middleware, MiddlewareAPI} from 'redux'
import {$do, needSaveAction, types} from '../actions/actions'
import {OperationTypeCrud} from '../interfaces/operation'
import {WidgetMeta} from '../interfaces/widget'
import {Store as CoreStore} from '../interfaces/store'
import {buildBcUrl} from '../utils/strings'
import {openButtonWarningNotification} from '../utils/notifications'
import i18n from 'i18next'

const saveFormMiddleware = ({ getState, dispatch }: MiddlewareAPI) =>
    (next: Dispatch) =>
        (action: AnyAction): any => {
            if (!needSaveAction(action.type)) {
                return next(action)
            }
            const state = getState()
            if (state.view.pendingValidationFails && Object.keys(state.view.pendingValidationFails).length) {
                openButtonWarningNotification(
                    i18n.t('Required fields are missing'),
                    i18n.t('Cancel changes'),
                    0,
                    () => {
                        dispatch($do.clearValidationFails(null))
                    },
                    'requiredFieldsMissing'
                )
                return
            }

            const selectedCell = state.view.selectedCell
            if (selectedCell
                && (action.type !== types.selectTableCellInit
                    || (selectedCell.widgetName !== action.payload.widgetName || selectedCell.rowId !== action.payload.rowId)
                )
            ) {
                const widget = state.view.widgets.find((v: WidgetMeta) => v.name === selectedCell.widgetName)
                const bcName = widget.bcName
                const cursor = state.screen.bo.bc[bcName] && state.screen.bo.bc[bcName].cursor
                if (cursor === selectedCell.rowId && bcHasPendingAutosaveChanges(state, bcName, cursor)) {
                    return next($do.sendOperation({
                        bcName: bcName,
                        operationType: OperationTypeCrud.save,
                        widgetName: action.payload.widgetName,
                        onSuccessAction: action
                    }))
                }
            }

            return next(action)
        }

export function createAutoSaveMiddleware() {
    return saveFormMiddleware as Middleware
}

function bcHasPendingAutosaveChanges(store: CoreStore, bcName: string, cursor: string) {
    let result = false

    const pendingChanges = store.view.pendingDataChanges
    const cursorChanges = pendingChanges[bcName] && pendingChanges[bcName][cursor]
    if (cursorChanges && !Object.keys(cursorChanges).includes('_associate') && Object.values(cursorChanges).length) {
        const bcUrl = buildBcUrl(bcName, true)
        const actions = bcUrl
            && store.view.rowMeta[bcName]
            && store.view.rowMeta[bcName][bcUrl]
            && store.view.rowMeta[bcName][bcUrl].actions

        result = actions && actions.some((action) => action.type === OperationTypeCrud.save)
    }

    return result
}
