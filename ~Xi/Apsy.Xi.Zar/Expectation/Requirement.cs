namespace Apsy.Xi.Zar;

public enum RequirementType
{
    Functional,
    NonFunctional,
    Design,
    Guideline
}

public class Requirement
{
    public string OriginalText {get;set;}
    public string Condition {get;set;}
    public string AcceptanceCriteria {get;set;}
    public string Role {get;set;}
    public RequirementType Type {get;set;}
    public List<Requirement> Prerequisites {get;set;} = [];
    public List<Block> ImplementedBy {get;set;} = [];
}
