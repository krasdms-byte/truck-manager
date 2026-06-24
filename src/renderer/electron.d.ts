// Типы для window.api — пробрасывается через Electron preload
interface Window {
  api: {
    auth: {
      login:  (data: { username: string; password: string }) => Promise<any>
      logout: () => Promise<any>
      verify: (token?: string) => Promise<any>
    }
    income: {
      getAll:   (filters?: object) => Promise<any[]>
      create:   (data: object)     => Promise<any>
      update:   (id: number, data: object) => Promise<any>
      remove:   (id: number)       => Promise<any>
      getTotal: (filters?: object) => Promise<number>
    }
    trips: {
      getAll:     (filters?: object) => Promise<any[]>
      create:     (data: object)     => Promise<any>
      update:     (id: number, data: object) => Promise<any>
      remove:     (id: number)       => Promise<any>
      getSummary: (filters?: object) => Promise<any[]>
    }
    employees: {
      getAll:      (filters?: object) => Promise<any[]>
      getById:     (id: number)       => Promise<any>
      create:      (data: object)     => Promise<any>
      update:      (id: number, data: object) => Promise<any>
      getShifts:   (filters?: object) => Promise<any[]>
      setShift:    (data: object)     => Promise<any>
      getPayments: (filters?: object) => Promise<any[]>
      addPayment:  (data: object)     => Promise<any>
      getSalary:   (employeeId: number, month: string) => Promise<any>
    }
    expenses: {
      getAll:  (filters?: object) => Promise<any[]>
      create:  (data: object)     => Promise<any>
      update:  (id: number, data: object) => Promise<any>
      remove:  (id: number)       => Promise<any>
    }
    parts: {
      getAll:      (filters?: object) => Promise<any[]>
      create:      (data: object)     => Promise<any>
      update:      (id: number, data: object) => Promise<any>
      remove:      (id: number)       => Promise<any>
      importExcel: (filePath: string) => Promise<any>
      receipts: {
        getAll:  (partId?: number)   => Promise<any[]>
        create:  (data: object)      => Promise<any>
        remove:  (id: number)        => Promise<any>
      }
    }
    projects: {
      getAll:            (filters?: object)                        => Promise<any[]>
      getById:           (id: number)                              => Promise<any>
      create:            (data: object)                            => Promise<any>
      update:            (id: number, data: object)                => Promise<any>
      remove:            (id: number)                              => Promise<any>
      getSummary:        (id: number, filters?: object)            => Promise<any>
      getRateGrid:       (id: number)                              => Promise<any[]>
      saveRateGrid:      (id: number, rows: object[])              => Promise<any>
      getRateForDistance:(id: number, km: number)                  => Promise<number | null>
    }
    trucks: {
      getAll:         () => Promise<any[]>
      getAllWithStats: (projectId?: number) => Promise<any[]>
      create:         (data: object) => Promise<any>
      update:         (id: number, data: object) => Promise<any>
    }
    reports: {
      getSummary:           (filters: object) => Promise<any>
      getByTruck:           (filters: object) => Promise<any[]>
      getByDriver:          (filters: object) => Promise<any[]>
      getMonthly:           (year: number)    => Promise<any[]>
      getDebts:             ()                => Promise<any[]>
      getProjectOrgSummary: (filters?: object)=> Promise<any[]>
    }
    backup: {
      create:  () => Promise<any>
      list:    () => Promise<any>
      restore: (fileName: string) => Promise<any>
    }
    dict: {
      categories: {
        getAll:  () => Promise<any[]>
        create:  (data: object) => Promise<any>
        update:  (id: number, data: object) => Promise<any>
        remove:  (id: number) => Promise<any>
      }
      units: {
        getAll:  () => Promise<any[]>
        create:  (data: object) => Promise<any>
        update:  (id: number, data: object) => Promise<any>
        remove:  (id: number) => Promise<any>
      }
      items: {
        getAll:  (filters?: object) => Promise<any[]>
        create:  (data: object) => Promise<any>
        update:  (id: number, data: object) => Promise<any>
        remove:  (id: number) => Promise<any>
      }
    }
    organizations: {
      getAll:    (filters?: object) => Promise<any[]>
      create:    (data: object)     => Promise<any>
      update:    (id: number, data: object) => Promise<any>
      remove:    (id: number)       => Promise<any>
      getDebts:  ()                 => Promise<any[]>
      closeDebt: (id: number, data: object) => Promise<any>
      lookupInn: (inn: string)      => Promise<any>
    }
    accommodation: {
      getSettings:     (projectId: number)                                        => Promise<any>
      saveSettings:    (projectId: number, data: object)                          => Promise<any>
      getWorkers:      (projectId: number)                                        => Promise<any[]>
      setWorker:       (projectId: number, employeeId: number, start: string, end: string | null) => Promise<any>
      removeWorker:    (projectId: number, employeeId: number)                    => Promise<any>
      calcDebts:       (projectId: number, month: string)                         => Promise<any>
      getDebts:        (projectId: number)                                        => Promise<any[]>
      getAllDebts:      ()                                                         => Promise<any[]>
      closeDebt:       (id: number, amount: number, incomeId?: number)            => Promise<any>
      closeMultiple:   (ids: number[], amount: number, incomeId?: number)         => Promise<any>
      setActualAmount: (id: number, amount: number | null)                        => Promise<any>
    }
    audit: {
      getLog:    (filters?: object) => Promise<any[]>
      getTables: ()                 => Promise<string[]>
    }
    claude: {
      recognize: (base64: string, mediaType: string) => Promise<any>
    }
    settings: {
      get: (key: string)              => Promise<any>
      set: (key: string, value: any)  => Promise<any>
    }
  }
}
