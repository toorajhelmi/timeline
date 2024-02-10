using Apsy.Xi.Basic;

namespace Apsy.Xi.Zar.Structure
{
    public class Element : Block
    {
        public string Name { get; set; }
        public List<Event> Events { get; set; } = [];
    }
}
