import { useApi } from "../../../environment-helpers/use-api"
import { initDb, useDb } from "../../../environment-helpers/use-db"

import {
  StepResponse,
  WorkflowData,
  createStep,
  createWorkflow,
} from "@medusajs/workflows-sdk"
import { AxiosInstance } from "axios"
import path from "path"
import { startBootstrapApp } from "../../../environment-helpers/bootstrap-app"
import { getContainer } from "../../../environment-helpers/use-container"
import adminSeeder from "../../../helpers/admin-seeder"

export const workflowEngineTestSuite = (env, extraParams = {}) => {
  const adminHeaders = {
    headers: {
      "x-medusa-access-token": "test_token",
    },
  }

  describe("Workflow Engine API", () => {
    let medusaContainer
    let dbConnection
    let shutdownServer

    beforeAll(async () => {
      const cwd = path.resolve(path.join(__dirname, "..", ".."))
      dbConnection = await initDb({ cwd, env, ...extraParams } as any)
      shutdownServer = await startBootstrapApp({ cwd, env })
      medusaContainer = getContainer()

      await adminSeeder(dbConnection)
    })

    afterAll(async () => {
      const db = useDb()
      await db.shutdown()
      await shutdownServer()
    })

    describe("running workflows", () => {
      beforeAll(async () => {
        const step1 = createStep(
          {
            name: "my-step",
          },
          async (input: { initial: string }) => {
            return new StepResponse({
              result: input.initial,
            })
          }
        )
        const step2 = createStep(
          {
            name: "my-step-async",
            async: true,
          },
          async () => {}
        )

        createWorkflow(
          {
            name: "my-workflow-name",
            retentionTime: 1000,
          },
          function (input: WorkflowData<{ initial: string }>) {
            step1(input)
            return step2()
          }
        )
      })

      it("Should list all workflows in execution or completed and retrieve them by id", async () => {
        const api = useApi()! as AxiosInstance

        for (let i = 3; i--; ) {
          await api.post(
            `/admin/workflows-executions/my-workflow-name/run`,
            {
              input: {
                initial: "abc",
              },
            },
            adminHeaders
          )
        }

        const executions = await api.get(
          `/admin/workflows-executions`,
          adminHeaders
        )

        expect(executions.data.count).toEqual(3)
        expect(executions.data.workflow_executions.length).toEqual(3)
        expect(executions.data.workflow_executions[0]).toEqual({
          workflow_id: "my-workflow-name",
          transaction_id: expect.any(String),
          id: expect.any(String),
          state: "invoking",
          created_at: expect.any(String),
          updated_at: expect.any(String),
          deleted_at: null,
        })

        const retrivedById = await api.get(
          `/admin/workflows-executions/` +
            executions.data.workflow_executions[0].id,
          adminHeaders
        )
        expect(retrivedById.data.workflow_execution).toEqual(
          expect.objectContaining(executions.data.workflow_executions[0])
        )
      })

      it("Should list all workflows matching the filters", async () => {
        const api = useApi()! as AxiosInstance

        for (let i = 3; i--; ) {
          await api.post(
            `/admin/workflows-executions/my-workflow-name/run`,
            {
              input: {
                initial: "abc",
              },
              transaction_id: "transaction_" + (i + 1),
            },
            adminHeaders
          )
        }

        const executions = await api.get(
          `/admin/workflows-executions?transaction_id[]=transaction_1&transaction_id[]=transaction_2`,
          adminHeaders
        )

        expect(executions.data.count).toEqual(2)
        expect(executions.data.workflow_executions.length).toEqual(2)
        expect(executions.data.workflow_executions[0]).toEqual({
          workflow_id: "my-workflow-name",
          transaction_id: expect.stringMatching(/transaction_1|transaction_2/),
          id: expect.any(String),
          state: "invoking",
          created_at: expect.any(String),
          updated_at: expect.any(String),
          deleted_at: null,
        })
        expect(executions.data.workflow_executions[1]).toEqual({
          workflow_id: "my-workflow-name",
          transaction_id: expect.stringMatching(/transaction_1|transaction_2/),
          id: expect.any(String),
          state: "invoking",
          created_at: expect.any(String),
          updated_at: expect.any(String),
          deleted_at: null,
        })
      })

      it("Should execute a workflow and retrieve its execution while running and when it is completed", async () => {
        const api = useApi()! as AxiosInstance

        const wf = await api.post(
          `/admin/workflows-executions/my-workflow-name/run`,
          {
            input: {
              initial: "abc",
            },
            transaction_id: "trx_123",
          },
          adminHeaders
        )

        expect(wf.data).toEqual({
          acknowledgement: {
            transactionId: "trx_123",
            workflowId: "my-workflow-name",
          },
        })

        const execution = await api.get(
          `/admin/workflows-executions/my-workflow-name/trx_123`,
          adminHeaders
        )

        expect(execution.data).toEqual({
          workflow_execution: expect.objectContaining({
            workflow_id: "my-workflow-name",
            transaction_id: "trx_123",
            id: expect.any(String),
            state: "invoking",
            execution: expect.objectContaining({
              hasAsyncSteps: true,
              hasFailedSteps: false,
              hasSkippedSteps: false,
              hasWaitingSteps: false,
              hasRevertedSteps: false,
            }),
            context: expect.objectContaining({
              data: expect.objectContaining({
                invoke: {
                  "my-step": {
                    __type: "WorkflowWorkflowData",
                    output: {
                      __type: "WorkflowStepResponse",
                      output: {
                        result: "abc",
                      },
                      compensateInput: {
                        result: "abc",
                      },
                    },
                  },
                },
                payload: {
                  initial: "abc",
                },
              }),
            }),
          }),
        })

        const respondAsync = await api.post(
          `/admin/workflows-executions/my-workflow-name/steps/success`,
          {
            transaction_id: "trx_123",
            step_id: "my-step-async",
            response: {
              all: "good",
            },
          },
          adminHeaders
        )

        expect(respondAsync.data.success).toEqual(true)

        const completed = await api.get(
          `/admin/workflows-executions/my-workflow-name/trx_123`,
          adminHeaders
        )

        expect(completed.data).toEqual({
          workflow_execution: expect.objectContaining({
            workflow_id: "my-workflow-name",
            transaction_id: "trx_123",
            state: "done",
            context: expect.objectContaining({
              data: expect.objectContaining({
                invoke: expect.objectContaining({
                  "my-step-async": {
                    __type: "WorkflowStepResponse",
                    output: {
                      all: "good",
                    },
                    compensateInput: {
                      all: "good",
                    },
                  },
                }),
              }),
            }),
          }),
        })
      })
    })
  })
}

describe("Noop test", () => {
  it("noop check", async () => {
    expect(true).toBe(true)
  })
})
