/// Every profession — drivers, mechanics and logistics staff — gets the
/// coupling, walk-around check and load steps. Logistics used to be
/// exempt; the business now requires walk-around checks from everyone.
/// Kept as a single gate so a future exemption is a one-line change.
bool requiresFieldChecks(Map<String, dynamic>? driver) => true;
