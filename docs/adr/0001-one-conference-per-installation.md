# One conference per installation

This system manages exactly one conference per deployment. There is no multi-tenancy, no conference selector, and no scoping of queries by conference ID. Running a new conference means deploying a fresh instance and wiping the database. This keeps every query simple and eliminates an entire class of cross-conference data leakage bugs. The operational cost (one Railway project per conference year) is acceptable.
