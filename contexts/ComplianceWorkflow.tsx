import { StackNavigationProp } from '@react-navigation/stack';
import { ComplianceWorkflow } from '@rizefinance/rize-js/types/lib/core/compliance-workflow';
import { Customer } from '@rizefinance/rize-js/types/lib/core/customer';
import { ComplianceDocument } from '@rizefinance/rize-js/types/lib/core/typedefs/compliance-workflow.typedefs';
import React, { useContext } from 'react';
import { RootStackParamList } from '../types';
import { CustomerContext } from './Customer';
import { AuthContextProps } from '../contexts/Auth';
import ComplianceWorkflowService from '../services/ComplianceWorkflowService';
import CustomerService from '../services/CustomerService';

export type ComplianceDocumentSelection = ComplianceDocument & {
    selected?: boolean;
    alreadyAccepted: boolean;
}

export type ComplianceWorkflowContextProps = {
    complianceWorkflow?: ComplianceWorkflow;
    agreements: ComplianceDocumentSelection[];
    disclosures: ComplianceDocumentSelection[];
    bankingDisclosures: ComplianceDocumentSelection[];
    setComplianceWorkflow: (complianceWorkflow: ComplianceWorkflow) => Promise<void>;
    setDisclosures: (disclosures: ComplianceDocumentSelection[]) => Promise<void>;
    setBankingDisclosures: (disclosures: ComplianceDocumentSelection[]) => Promise<void>;
    loadAgreements: () => Promise<void>;

}

export const ComplianceWorkflowContext = React.createContext<ComplianceWorkflowContextProps>({
    complianceWorkflow: undefined,
    agreements: [],
    disclosures: [],
    bankingDisclosures: [],
    setComplianceWorkflow: () => Promise.resolve(),
    setDisclosures: () => Promise.resolve(),
    setBankingDisclosures: () => Promise.resolve(),
    loadBankingDisclosures: () => Promise.resolve(),
    loadAgreements: () => Promise.resolve(),
});

export interface ComplianceWorkflowProviderProps {
    children?: JSX.Element;
    navigation: StackNavigationProp<RootStackParamList>;
    auth: AuthContextProps;
}

export type ComplianceWorkflowProviderState = {
    complianceWorkflow?: ComplianceWorkflow;
    disclosures: ComplianceDocumentSelection[];
    bankingDisclosures: ComplianceDocumentSelection[];
}

const initialState = {
    complianceWorkflow: undefined,
    agreements: [],
    disclosures: [],
    bankingDisclosures: []
};

export class ComplianceWorkflowProvider extends React.Component<ComplianceWorkflowProviderProps, ComplianceWorkflowProviderState> {
    static contextType = CustomerContext;
    context: React.ContextType<typeof CustomerContext>;

    constructor(props: ComplianceWorkflowProviderProps) {
        super(props);

        this.state = initialState;
    }

    async componentDidMount(): Promise<void> {
        await this.evaluateCurrentStep();
    }

    evaluateCurrentStep = async (): Promise<void> => {
        const customer = this.context.customer;

        if (customer?.status === 'initiated') {
            // Get the latest workflow of the customer
            const latestWorkflow = await ComplianceWorkflowService.viewLatestWorkflow(this.props.auth.accessToken);

            if (latestWorkflow.summary.status === 'expired') {
                await this.renewComplianceWorkflow();
            } else {
                await this.setComplianceWorkflow(latestWorkflow);
            }

            await this.redirectToCurrentStep(latestWorkflow, customer);
        }
    }

    loadAgreements = async (): Promise<void> => {
        const customer = this.context.customer;

        try {
            const { accepted_documents: agreements } = await ComplianceWorkflowService.viewLatestWorkflow(this.props.auth.accessToken);
            console.log(agreements)
            this.setState({ agreements });
            return { data: agreements };
        } catch (err) {
            return { data: err };
        }
    }

    loadDisclosures = async (): Promise<void> => {
        const {
            all_documents: all,
            accepted_documents: accepted,
            current_step_documents_pending: pending
        } = await this.state.complianceWorkflow;

        const acceptedDisclosures = accepted.filter(x => x.step === 1);
        const pendingDisclosures = pending.filter(x => x.step === 1);
        const allDisclosures = all.filter(x => x.step === 1).map(x => {
            const acceptedTerm = acceptedDisclosures.find(acc => acc.name === x.name);
            const pendingTerm = pendingDisclosures.find(acc => acc.name === x.name);
            
            return {
                ...x,
                selected: !!acceptedTerm,
                uid: acceptedTerm?.uid ?? pendingTerm.uid,
                alreadyAccepted: !!acceptedTerm
            } as ComplianceDocumentSelection;
        });

        await this.promisedSetState({ disclosures: allDisclosures });
    }

    loadBankingDisclosures = async (): Promise<void> => {
        if (this.state.complianceWorkflow === undefined) return;
        const {
            all_documents: all,
            accepted_documents: accepted,
            current_step_documents_pending: pending
        } = await this.state.complianceWorkflow;

        const acceptedBankingDisclosures = accepted.filter(x => x.name === 'Deposit Agreement and Disclosures');
        const pendingBankingDisclosures = pending.filter(x => x.name === 'Deposit Agreement and Disclosures');
        const allDisclosures = all.filter(x =>     x.name === 'Deposit Agreement and Disclosures').map(x => {
            const acceptedBankingDisc = acceptedBankingDisclosures.find(acc => acc.name === x.name);
            const pendingBankingDisc = pendingBankingDisclosures.find(acc => acc.name === x.name);
            
            return {
                ...x,
                selected: !!acceptedBankingDisc,
                uid: acceptedBankingDisc?.uid ?? pendingBankingDisc.uid,
                alreadyAccepted: !!acceptedBankingDisc
            } as ComplianceDocumentSelection;
        });

        await this.promisedSetState({ bankingDisclosures: allDisclosures });
    }

    redirectToCurrentStep = async (workflow: ComplianceWorkflow, customer: Customer): Promise<void> => {
        const navigation = this.props.navigation;

        await this.loadDisclosures();

        let currentScreen: keyof RootStackParamList = 'Disclosures';

        if (workflow.summary.current_step === 1) {
            currentScreen = 'Disclosures';
        } else if (workflow.summary.current_step === 2) {
            // Check if Patriot Act is not yet acknowledged
            const isPatriotActAcknowledged = !!workflow.accepted_documents
                .find(x => x.external_storage_name === 'usa_ptrt_0');

            if (!isPatriotActAcknowledged) {
                currentScreen = 'PatriotAct';
            } else {
                // Check if there are no customer details yet
                if (!customer.details?.first_name) {
                    currentScreen = 'PII';
                } else {
                    currentScreen = 'BankingDisclosures';
                }
            }
        }

        const steps: (keyof RootStackParamList)[] = [
            'Disclosures',
            'PatriotAct',
            'PII',
            'BankingDisclosures'
        ];

        if (currentScreen && steps.includes(currentScreen)) {
            for (const step of steps) {
                navigation.navigate(step);

                if (step === currentScreen) {
                    break;
                }
            }
        }
    };

    renewComplianceWorkflow = async (): Promise<void> => {
        const newComplianceWorkflow = await ComplianceWorkflowService.renewWorkflow(this.props.auth.accessToken);
        const customer = await CustomerService.getCustomer(this.props.auth.accessToken);

        await this.setComplianceWorkflow(newComplianceWorkflow);
        await this.context.setCustomer(customer);
    };

    promisedSetState = async <K extends keyof ComplianceWorkflowProviderState>(
        state: Pick<ComplianceWorkflowProviderState, K> | ((prevState: Readonly<ComplianceWorkflowProviderState>, props: Readonly<ComplianceWorkflowProviderProps>) => (Pick<ComplianceWorkflowProviderState, K> | ComplianceWorkflowProviderState | null)) | null
    ): Promise<void> => {
        return new Promise((resolve) => {
            this.setState(state, () => { resolve(); });
        });
    }

    setComplianceWorkflow = async (complianceWorkflow: ComplianceWorkflow): Promise<void> => {
        await this.promisedSetState({ complianceWorkflow });
    }

    setDisclosures = async (disclosures: ComplianceDocumentSelection[]): Promise<void> => {
        await this.promisedSetState({ disclosures });
    }

    setBankingDisclosures = async (bankingDisclosures: ComplianceDocumentSelection[]): Promise<void> => {
        await this.promisedSetState({ bankingDisclosures });
    }

    render(): JSX.Element {
        const {
            complianceWorkflow,
            disclosures,
            agreements,
            bankingDisclosures,
        } = this.state;

        return (
            <ComplianceWorkflowContext.Provider
                value={{
                    complianceWorkflow: complianceWorkflow,
                    disclosures: disclosures,
                    agreements: agreements,
                    bankingDisclosures: bankingDisclosures,
                    evaluateCurrentStep: this.evaluateCurrentStep,
                    setComplianceWorkflow: this.setComplianceWorkflow,
                    setDisclosures: this.setDisclosures,
                    setBankingDisclosures: this.setBankingDisclosures,
                    loadBankingDisclosures: this.loadBankingDisclosures,
                    loadAgreements: this.loadAgreements,
                }}
            >
                {this.props.children}
            </ComplianceWorkflowContext.Provider>
        );
    }
}

export const ComplianceWorkflowConsumer = ComplianceWorkflowContext.Consumer;

export const useComplianceWorkflow = (): ComplianceWorkflowContextProps => useContext(ComplianceWorkflowContext);