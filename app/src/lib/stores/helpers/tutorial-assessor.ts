import { IRepositoryState } from '../../app-state'
import { TutorialStep } from '../../../models/tutorial-step'
import { TipState } from '../../../models/tip'
import { ExternalEditor } from '../../editors'
import { setBoolean, getBoolean } from '../../local-storage'

const skipInstallEditorKey = 'tutorial-install-editor-skipped'
const skipCreatePullRequestKey = 'tutorial-skip-create-pull-request'

/**
 * Used to determine which step of the onboarding
 * tutorial the user needs to complete next
 *
 * Stores some state that only it needs to know about. The
 * actual step result is stored in App Store so the rest of
 * the app can access it.
 */
export class OnboardingTutorialAssessor {
  /** Has the user opted to skip the install editor step? */
  private installEditorSkipped: boolean = getBoolean(
    skipInstallEditorKey,
    false
  )
  /** Has the user opted to skip the create pull request step? */
  private createPRSkipped: boolean = getBoolean(skipCreatePullRequestKey, false)

  public constructor(
    /** Method to call when we need to get the current editor */
    private getResolvedExternalEditor: () => ExternalEditor | null
  ) {}

  /** Determines what step the user needs to complete next in the Onboarding Tutorial */
  public async getCurrentStep(
    isTutorialRepo: boolean,
    repositoryState: IRepositoryState
  ): Promise<TutorialStep> {
    if (!isTutorialRepo) {
      return TutorialStep.NotApplicable
    } else if (!(await this.isEditorInstalled())) {
      return TutorialStep.PickEditor
    } else if (!this.isBranchCheckedOut(repositoryState)) {
      return TutorialStep.CreateBranch
    } else if (!this.hasChangedFile(repositoryState)) {
      return TutorialStep.EditFile
    } else if (!this.hasMultipleCommits(repositoryState)) {
      return TutorialStep.MakeCommit
    } else if (!this.commitPushed(repositoryState)) {
      return TutorialStep.PushBranch
    } else if (!this.pullRequestCreated(repositoryState)) {
      return TutorialStep.OpenPullRequest
    } else {
      return TutorialStep.AllDone
    }
  }

  private async isEditorInstalled(): Promise<boolean> {
    return (
      this.installEditorSkipped || this.getResolvedExternalEditor() !== null
    )
  }

  private isBranchCheckedOut(repositoryState: IRepositoryState): boolean {
    const { branchesState } = repositoryState
    const { tip } = branchesState

    const currentBranchName =
      tip.kind === TipState.Valid ? tip.branch.name : null
    const defaultBranchName =
      branchesState.defaultBranch !== null
        ? branchesState.defaultBranch.name
        : null

    return (
      currentBranchName !== null &&
      defaultBranchName !== null &&
      currentBranchName !== defaultBranchName
    )
  }

  private hasChangedFile(repositoryState: IRepositoryState): boolean {
    if (this.hasMultipleCommits(repositoryState)) {
      // User has already committed a change
      return true
    }
    const { changesState } = repositoryState
    return changesState.workingDirectory.files.length > 0
  }

  private hasMultipleCommits(repositoryState: IRepositoryState): boolean {
    const { branchesState } = repositoryState
    const { tip } = branchesState

    if (tip.kind === TipState.Valid) {
      // For some reason sometimes the initial commit has a parent sha
      // listed as an empty string...
      // For now I'm filtering those out. Would be better to prevent that from happening
      return tip.branch.tip.parentSHAs.some(x => x.length > 0)
    }

    return false
  }

  private commitPushed(repositoryState: IRepositoryState): boolean {
    const { aheadBehind } = repositoryState
    return aheadBehind !== null && aheadBehind.ahead === 0
  }

  private pullRequestCreated(repositoryState: IRepositoryState): boolean {
    if (this.createPRSkipped) {
      return true
    }

    return repositoryState.branchesState.currentPullRequest !== null
  }

  /** Call when the user opts to skip the install editor step */
  public skipInstallEditor = () => {
    this.installEditorSkipped = true
    setBoolean(skipInstallEditorKey, this.installEditorSkipped)
  }

  /** Call when the user opts to skip the create pull request step */
  public skipCreatePR = () => {
    this.createPRSkipped = true
    setBoolean(skipCreatePullRequestKey, this.createPRSkipped)
  }

  /**
   * Call when a new tutorial repository is created
   *
   * (Resets its internal skipped steps state.)
   */
  public onNewTutorialRepository = () => {
    this.installEditorSkipped = false
    localStorage.removeItem(skipInstallEditorKey)
    this.createPRSkipped = false
    localStorage.removeItem(skipCreatePullRequestKey)
  }
}
