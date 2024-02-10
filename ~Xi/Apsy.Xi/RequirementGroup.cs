namespace Apsy.Xi;

public class RequirementGroup
{
    public int Id { get; set; }
    public string Condition {get;set;}
    public override string ToString()
    {
        return $"Id={Id}, Condition={Condition}";
    }
}
